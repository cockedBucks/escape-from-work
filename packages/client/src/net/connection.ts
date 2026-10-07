import { Client, type EndpointSettings, type Room } from '@colyseus/sdk';
import { ROOM_NAME, type CreateGame, type GameListing, type NetTuning, type RacePhase, type Tuning } from '@escape/shared';
import type { CarSource } from '../game';
import { AdaptiveDelay } from './adaptiveDelay';
import { ServerTimeline } from './latency';
import { SnapshotBuffer, type CarSnap } from './snapshots';

/** How fast the snapshot timeline may slide later per snapshot (ms), to follow a slower network. */
const TIMELINE_RELAX_MS = 0.5;

/** One synced car as decoded by the SDK (see packages/server/src/schema/RaceState.ts). */
export interface CarViewState {
  x: number;
  z: number;
  y: number;
  yaw: number;
  speed: number;
  steer: number;
  progress: number;
  respawning: boolean;
  ghost: boolean;
  /** Battle (P11.6): lives left, and out of the battle. */
  lives: number;
  out: boolean;
  heat: number;
  stallLeft: number;
  drift: number;
  driftLevel: number;
  driftCharge: number;
  boostLeft: number;
  slip: number;
  onSwap: boolean;
  nitro: number;
  nitroOn: boolean;
  solo: boolean;
  item: string;
  spinLeft: number;
  shieldLeft: number;
  blueLeft: number;
  lagLeft: number;
  swapLeft: number;
  updateLeft: number;
  inNitro: boolean;
  vx: number;
  vz: number;
  vy: number;
  inSteer: number;
  inGas: boolean;
  inBrake: boolean;
  inDrift: boolean;
  bot: boolean;
  lapsDone: number;
  place: number;
  finished: boolean;
  dnf: boolean;
  wrongWay: boolean;
  finishMs: number;
  gapMs: number;
  bestLapMs: number;
}

/** One synced player (see PlayerState on the server). */
export interface PlayerViewState {
  name: string;
  slot: number;
  seat: string;
  role: string;
  connected: boolean;
  ready: boolean;
  face: string;
  headYaw: number;
  headPitch: number;
  /** Last input seq the server applied for this player. */
  ackSeq: number;
}

/** What the client reads from the synced room state (decoded by reflection). */
export interface RaceStateView {
  players: { size: number; forEach(cb: (p: PlayerViewState, id: string) => void): void; get(id: string): PlayerViewState | undefined };
  cars: { forEach(cb: (car: CarViewState, id: string) => void): void; get(id: string): CarViewState | undefined; size: number };
  tick: number;
  tickMs: number;
  phase: RacePhase;
  phaseTick: number;
  host: string;
  laps: number;
  /** The track raced (config/tracks id; '' until the first state arrives). */
  track: string;
  teams: ArrayLike<string> & Iterable<string>;
  carModels: ArrayLike<string> & Iterable<string>;
  bots: boolean;
  chaos: boolean;
  /** 'race' or 'battle' (P11.6). */
  mode: string;
  /** The game's name ('' = the server's always-open game), P12.1. */
  game: string;
  boxesUp: string;
  shots: { forEach(cb: (s: { kind: string; x: number; z: number; vx: number; vz: number }, id: string) => void): void };
}

/** Car slots driven by server bots (car ids are "car<slot>"). */
export function botSlotsOf(state: { cars: { forEach(cb: (c: { bot: boolean }, id: string) => void): void } }): number[] {
  const slots: number[] = [];
  state.cars.forEach((c, id) => {
    if (c.bot) slots.push(Number(id.slice('car'.length)));
  });
  return slots;
}

export interface PageLocation {
  protocol: string;
  hostname: string;
  port: string;
}

/**
 * Where the game server is. Production: the server also serves this page, so same host
 * and port. Dev: Vite serves the page, the game server is on `net.port` of the same host.
 */
export function serverEndpoint(loc: PageLocation, dev: boolean, gamePort: number): EndpointSettings {
  const secure = loc.protocol === 'https:';
  const pagePort = loc.port === '' ? (secure ? 443 : 80) : Number(loc.port);
  return { hostname: loc.hostname, secure, port: dev ? gamePort : pagePort };
}

const gameServer = (tuning: Tuning): EndpointSettings => serverEndpoint(window.location, import.meta.env.DEV, tuning.net.port);

/** Any game (the `hello` page only counts players). */
export function joinRace(tuning: Tuning): Promise<Room<unknown, RaceStateView>> {
  return new Client(gameServer(tuning)).join<RaceStateView>(ROOM_NAME);
}

/** The games on the server to join (P12.1); null when the server cannot be reached. */
export async function fetchGames(): Promise<GameListing[] | null> {
  try {
    const res = await fetch('/games.json', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as { games: GameListing[] }).games : null;
  } catch {
    return null;
  }
}

/** Host a new game with these settings; you are its first player (and so its host). */
export async function hostGame(tuning: Tuning, settings: CreateGame): Promise<Room<unknown, RaceStateView>> {
  return remember(await new Client(gameServer(tuning)).create<RaceStateView>(ROOM_NAME, settings));
}

/** Join the game with this id (from `fetchGames`). */
export async function joinGame(tuning: Tuning, id: string): Promise<Room<unknown, RaceStateView>> {
  return remember(await new Client(gameServer(tuning)).joinById<RaceStateView>(id));
}

/** The server's always-open game (`?play`, tools): straight in, no menu. */
export async function joinDefaultGame(tuning: Tuning): Promise<Room<unknown, RaceStateView>> {
  const id = (await fetchGames())?.find((g) => g.isDefault)?.id;
  return id ? joinGame(tuning, id) : remember(await new Client(gameServer(tuning)).join<RaceStateView>(ROOM_NAME));
}

/**
 * Take back your seat: if this browser left a game a moment ago (tab closed or reloaded),
 * reconnect with the saved token so the server restores the seat. Null when there is none.
 */
export async function reconnectSaved(tuning: Tuning): Promise<Room<unknown, RaceStateView> | null> {
  const token = usableSession(readSession(), Date.now(), tuning.net.reconnectSeconds);
  if (!token) return null;
  try {
    return remember(await new Client(gameServer(tuning)).reconnect<RaceStateView>(token));
  } catch {
    clearSession();
    return null; // seat no longer held (or still in use by another tab)
  }
}

/** How long Leave waits for the server to confirm before the page moves on anyway (ms). */
const LEAVE_WAIT_MS = 1500;

/**
 * Leaving on purpose (Leave game): free the seat at once and do not come back on reload.
 * Never hangs: a dropped connection skips the goodbye (the SDK would wait forever for it),
 * and a slow server gets `LEAVE_WAIT_MS` (it frees the seat on its own when the socket closes).
 */
export async function leaveGame(room: Room<unknown, RaceStateView>): Promise<void> {
  leaving = true;
  clearSession();
  if (!room.connection.isOpen) return;
  await Promise.race([room.leave(true).catch(() => {}), new Promise<void>((resolve) => setTimeout(resolve, LEAVE_WAIT_MS))]);
}

/** Set by `leaveGame`: the page going away must not save the seat to come back to. */
let leaving = false;

/** Remember the room's latest token when the page goes away, with the time it left. */
function remember(room: Room<unknown, RaceStateView>): Room<unknown, RaceStateView> {
  window.addEventListener('pagehide', () => {
    if (!leaving) writeSession(room.reconnectionToken);
  });
  return room;
}

const SESSION_KEY = 'efw.session';

interface SavedSession {
  token: string;
  /** When the page was left (ms since epoch): the server holds the seat from about then. */
  leftAt: number;
}

/** A saved session is worth trying while the server may still hold the seat. */
export function usableSession(saved: SavedSession | null, now: number, reconnectSeconds: number): string | null {
  if (!saved || typeof saved.token !== 'string' || typeof saved.leftAt !== 'number') return null;
  return now - saved.leftAt < reconnectSeconds * 1000 ? saved.token : null;
}

/** Did this browser leave a seat a moment ago (reload, closed tab)? Then skip the menu and rejoin. */
export function hasSavedSeat(tuning: Tuning): boolean {
  return usableSession(readSession(), Date.now(), tuning.net.reconnectSeconds) !== null;
}

function readSession(): SavedSession | null {
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null') as SavedSession | null;
  } catch {
    return null;
  }
}

function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // nothing saved
  }
}

function writeSession(token: string): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ token, leftAt: Date.now() } satisfies SavedSession));
  } catch {
    // Storage blocked: a reopened tab simply joins as a new player.
  }
}


/**
 * Cars from the server: every state patch becomes a snapshot on a smooth tick-based
 * timeline, and the game draws them a little in the past, blending between snapshots. How
 * far in the past adapts to the network (AdaptiveDelay, P13.1).
 */
export class ServerCarSource implements CarSource {
  private readonly buffer = new SnapshotBuffer();
  private readonly timeline: ServerTimeline;
  private readonly delay: AdaptiveDelay;
  private extrapolateMs: number;
  private lastSample = -1;
  /** Client time the latest snapshot arrived (ms), for the F3 "snapshot age". */
  lastArrival = -1;
  /** Timeline time of the latest snapshot (ms): when it happened, without arrival jitter. */
  lastTime = -1;
  /** Frames drawn past the newest snapshot (the buffer ran dry), and all frames: for F3. */
  starvedFrames = 0;
  frames = 0;

  /**
   * @param net `net` tuning (interpolation delay bounds, extrapolation; tunable live via `setTuning`)
   * @param dtMs one server tick in ms (`sim.dt × 1000`): snapshots are timed by tick, not arrival
   */
  constructor(net: NetTuning, dtMs: number) {
    this.timeline = new ServerTimeline(dtMs, TIMELINE_RELAX_MS);
    this.delay = new AdaptiveDelay(net);
    this.extrapolateMs = net.extrapolateMaxMs;
  }

  setTuning(net: NetTuning): void {
    this.delay.setTuning(net);
    this.extrapolateMs = net.extrapolateMaxMs;
  }

  /** How far in the past other cars are drawn now (ms). */
  get interpDelayMs(): number {
    return this.delay.current;
  }

  /** 95th-percentile lateness of recent snapshots (ms): the network's jitter. */
  get jitterMs(): number {
    return this.delay.jitterMs;
  }

  /** Call on every state change. */
  push(now: number, state: RaceStateView): void {
    const cars = new Map<string, CarSnap>();
    state.cars.forEach((c, id) => {
      cars.set(id, { x: c.x, y: c.y, z: c.z, yaw: c.yaw, speed: c.speed, steer: c.steer, respawning: c.respawning, ghost: c.ghost, stalled: c.stallLeft > 0,
        drift: c.drift, driftLevel: c.driftLevel, boosting: c.boostLeft > 0, nitroOn: c.nitroOn, drafting: c.slip > 0,
        shielded: c.shieldLeft > 0 });
    });
    this.lastArrival = now;
    this.lastTime = this.timeline.timeOf(state.tick, now);
    this.delay.onSnapshot(now - this.lastTime);
    this.buffer.push(this.lastTime, cars);
  }

  sample(now: number, out: Map<string, CarSnap>): void {
    // Several samples in one frame (game + camera) must not move the delay twice.
    if (now !== this.lastSample) {
      this.delay.update(this.lastSample < 0 ? 0 : now - this.lastSample);
      this.lastSample = now;
      this.frames++;
      this.buffer.sample(now - this.delay.current, out, this.extrapolateMs);
      if (this.buffer.starved) this.starvedFrames++;
      return;
    }
    this.buffer.sample(now - this.delay.current, out, this.extrapolateMs);
  }
}
