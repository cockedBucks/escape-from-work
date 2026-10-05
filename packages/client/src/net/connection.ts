import { Client, type EndpointSettings, type Room } from '@colyseus/sdk';
import { ROOM_NAME, type RacePhase, type Tuning } from '@escape/shared';
import type { CarSource } from '../game';
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
  vx: number;
  vz: number;
  vy: number;
  inSteer: number;
  inGas: boolean;
  inBrake: boolean;
  lapsDone: number;
  place: number;
  finished: boolean;
  dnf: boolean;
  wrongWay: boolean;
  finishMs: number;
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
  teams: ArrayLike<string> & Iterable<string>;
  bots: boolean;
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

export function joinRace(tuning: Tuning): Promise<Room<unknown, RaceStateView>> {
  const endpoint = serverEndpoint(window.location, import.meta.env.DEV, tuning.net.port);
  return new Client(endpoint).join<RaceStateView>(ROOM_NAME);
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

function readSession(): SavedSession | null {
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null') as SavedSession | null;
  } catch {
    return null;
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
 * Join the race, or take back your seat: if this browser left the race a moment ago (tab
 * closed or reloaded), reconnect with the saved token so the server restores your seat.
 */
export async function joinOrReconnect(tuning: Tuning): Promise<Room<unknown, RaceStateView>> {
  const endpoint = serverEndpoint(window.location, import.meta.env.DEV, tuning.net.port);
  const token = usableSession(readSession(), Date.now(), tuning.net.reconnectSeconds);
  let room: Room<unknown, RaceStateView> | null = null;
  if (token) {
    try {
      room = await new Client(endpoint).reconnect<RaceStateView>(token);
    } catch {
      room = null; // seat no longer held (or still in use by another tab): join fresh
    }
  }
  room ??= await new Client(endpoint).join<RaceStateView>(ROOM_NAME);
  const joined = room;
  // Remember the latest token when the page goes away, with the time it left.
  window.addEventListener('pagehide', () => writeSession(joined.reconnectionToken));
  return joined;
}

/**
 * Cars from the server: every state patch becomes a snapshot stamped with the arrival
 * time, and the game draws `net.interpDelayMs` in the past, blending between snapshots.
 */
export class ServerCarSource implements CarSource {
  private readonly buffer = new SnapshotBuffer();
  private readonly timeline: ServerTimeline;
  /** Client time the latest snapshot arrived (ms), for the F3 "snapshot age". */
  lastArrival = -1;
  /** Timeline time of the latest snapshot (ms): when it happened, without arrival jitter. */
  lastTime = -1;

  /**
   * @param interpDelayMs how far in the past cars are drawn (`net.interpDelayMs`, tunable live)
   * @param dtMs one server tick in ms (`sim.dt × 1000`): snapshots are timed by tick, not arrival
   */
  constructor(
    public interpDelayMs: number,
    dtMs: number,
  ) {
    this.timeline = new ServerTimeline(dtMs, TIMELINE_RELAX_MS);
  }

  /** Call on every state change. */
  push(now: number, state: RaceStateView): void {
    const cars = new Map<string, CarSnap>();
    state.cars.forEach((c, id) => {
      cars.set(id, { x: c.x, y: c.y, z: c.z, yaw: c.yaw, speed: c.speed, steer: c.steer, respawning: c.respawning, ghost: c.ghost });
    });
    this.lastArrival = now;
    this.lastTime = this.timeline.timeOf(state.tick, now);
    this.buffer.push(this.lastTime, cars);
  }

  sample(now: number, out: Map<string, CarSnap>): void {
    this.buffer.sample(now - this.interpDelayMs, out);
  }
}
