// Networked bots: one car = one Pilot-bot client + one Engineer-bot client, each a real
// WebSocket connection that sees only the synced state, exactly like a player's browser.
// Used by `npm run bots` (scripts/bots.mjs) and tests/bot-clients.test.ts. Runs in Node.
import { Client, type EndpointSettings, type Room } from '@colyseus/sdk';
import {
  DEFAULT_TRACK,
  MSG,
  ROOM_NAME,
  botItem,
  botPedals,
  botRoute,
  botDrift,
  botSteer,
  carIdForSlot,
  carStateFromView,
  newBotMemory,
  resetStuck,
  type BotMemory,
  type CarDef,
  type GameListing,
  type CarState,
  type CarStats,
  type CarViewLike,
  type InputMessage,
  type LobbyError,
  type Track,
  type Tuning,
} from '@escape/shared';

interface BotStateView {
  phase?: string;
  /** Server tick and the tick the phase began (the countdown's timing, for the rocket start). */
  tick?: number;
  phaseTick?: number;
  players?: {
    forEach(cb: (p: { slot: number; seat: string }, id: string) => void): void;
    get(id: string): { slot: number; seat: string } | undefined;
  };
  cars?: {
    get(id: string): (CarViewLike & { progress: number }) | undefined;
    forEach(cb: (car: CarViewLike & { progress: number }, id: string) => void): void;
  };
  /** Roster car id per slot (the team's pick). */
  carModels?: ArrayLike<string>;
  /** The track the server races (config/tracks/<id>.json). */
  track?: string;
}

/** The stats of the car a slot drives (its pick, else roster car N like the server's default). */
export function slotStats(roster: readonly CarDef[], carModels: ArrayLike<string> | undefined, slot: number): CarStats {
  const picked = carModels?.[slot];
  return (roster.find((d) => d.id === picked) ?? roster[slot % roster.length] ?? roster[0]!).stats;
}

export interface BotCarOptions {
  endpoint: EndpointSettings;
  tuning: Tuning;
  /**
   * Loads a track by id (config/tracks/<id>.json). The bots drive the track the server
   * names in its state, and switch when the host picks another one in the lobby.
   */
  loadTrack: (id: string) => Track;
  /** The car roster (config/cars.json): each bot plans with the stats of the car its slot drives. */
  roster: readonly CarDef[];
  /** Car slot to drive; -1 = first empty car. */
  slot?: number;
  /** Tell the server these clients are bots, so the league never scores them (default true). */
  markBot?: boolean;
  name?: string;
  /** The game (room id) to drive in; absent = the server's always-open game (P12.1). */
  game?: string;
}

/** The server's games (`GET /games.json`), or null when it does not answer. */
async function listGames(endpoint: EndpointSettings): Promise<GameListing[] | null> {
  try {
    const res = await fetch(`${endpoint.secure ? 'https' : 'http'}://${endpoint.hostname}:${endpoint.port}/games.json`);
    if (!res.ok) return null;
    const games = ((await res.json()) as { games?: unknown }).games;
    return Array.isArray(games) ? (games as GameListing[]) : null;
  } catch {
    return null;
  }
}

/** A game's room id by its id or name (`npm run bots -- --game "Lunch Cup"`); null if none. */
export async function findGame(endpoint: EndpointSettings, idOrName: string): Promise<string | null> {
  const games = (await listGames(endpoint)) ?? [];
  return (games.find((g) => g.id === idOrName) ?? games.find((g) => g.name === idOrName))?.id ?? null;
}

/** Join a game by id, or the always-open one (older servers without a list: any race room). */
async function joinBotGame(endpoint: EndpointSettings, game: string | undefined, bot: boolean): Promise<Room<BotStateView>> {
  const id = game ?? (await listGames(endpoint))?.find((g) => g.isDefault)?.id;
  const client = new Client(endpoint);
  return id ? client.joinById<BotStateView>(id, { bot }) : client.join<BotStateView>(ROOM_NAME, { bot });
}

export interface BotCar {
  slot: number;
  /** The track id the bots are driving right now (the server's). */
  track: () => string;
  /** Laps completed (start-line crossings after the first). */
  laps: () => number;
  /** Lap times in seconds (client clock). */
  lapTimes: () => number[];
  stop(): Promise<void>;
}

/** Lap progress jumping from above this to below `1 - this` = the car crossed the start line. */
const WRAP = 0.75;

/** First slot with nobody in it, from a players map. */
function freeSlot(state: BotStateView, maxCars: number): number {
  const used = new Set<number>();
  state.players?.forEach((p) => {
    if (p.seat !== '') used.add(p.slot);
  });
  for (let s = 0; s < maxCars; s++) if (!used.has(s)) return s;
  return -1;
}

function waitFor<S>(room: Room<unknown, S>, check: (s: S) => boolean, ms: number): Promise<S> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bot: timed out waiting for room state')), ms);
    const listener = (s: S): void => {
      if (!check(s)) return;
      clearTimeout(timer);
      room.onStateChange.remove(listener);
      resolve(s);
    };
    room.onStateChange(listener);
    const now = room.state as S | undefined;
    if (now !== undefined) listener(now);
  });
}

/** How long a bot waits for the server to confirm things (ms). */
const CONFIRM_MS = 5000;

/** Bots do not need these broadcasts; listening keeps the SDK from warning about each one. */
function ignoreBroadcasts(room: Room): void {
  for (const type of [MSG.events, MSG.tuning, MSG.reload, MSG.raceRecord]) room.onMessage(type, () => {});
}

/**
 * Ask for a seat and wait until the server confirms it. Fails loudly when the server
 * refuses (a person or another bot run took it), instead of driving from no seat.
 */
async function takeSeat(room: Room<unknown, BotStateView>, slot: number, seat: 'pilot' | 'engineer'): Promise<void> {
  let refused: (reason: Error) => void = () => {};
  const refusal = new Promise<never>((_, reject) => (refused = reject));
  room.onMessage(MSG.lobbyError, (e: LobbyError) => refused(new Error(`bot: car ${slot + 1} ${seat} seat refused: ${e.reason}`)));
  room.send(MSG.setSeat, { slot, seat });
  await Promise.race([
    waitFor(room, (s) => {
      const me = s.players?.get(room.sessionId);
      return me?.slot === slot && me.seat === seat;
    }, CONFIRM_MS),
    refusal,
  ]);
}

/** Start one bot car (two clients). Resolves once both bots are seated. */
export async function startBotCar(opts: BotCarOptions): Promise<BotCar> {
  const { endpoint, tuning, roster } = opts;
  const bot = opts.markBot ?? true;
  const pilot = await joinBotGame(endpoint, opts.game, bot);
  ignoreBroadcasts(pilot);
  const first = await waitFor(pilot, (s) => s.players !== undefined, CONFIRM_MS);
  const slot = opts.slot !== undefined && opts.slot >= 0 ? opts.slot : freeSlot(first, tuning.race.maxCars);
  if (slot < 0) {
    await pilot.leave();
    throw new Error('bot: no empty car left');
  }
  const label = opts.name ?? `Bot ${slot + 1}`;
  pilot.send(MSG.setName, { name: `${label} P` });
  // The Engineer sits in the Pilot's game, whatever game that is.
  const engineer = await new Client(endpoint).joinById<BotStateView>(pilot.roomId, { bot });
  ignoreBroadcasts(engineer);
  engineer.send(MSG.setName, { name: `${label} E` });
  try {
    await takeSeat(pilot, slot, 'pilot');
    await takeSeat(engineer, slot, 'engineer');
  } catch (err) {
    await Promise.allSettled([pilot.leave(), engineer.leave()]);
    throw err;
  }

  const carId = carIdForSlot(slot);
  const seated = await waitFor(engineer, (s) => s.cars?.get(carId) !== undefined, CONFIRM_MS);

  // The track the server races; reloaded when the host switches tracks (pages reload, bots stay).
  let trackId = seated.track || DEFAULT_TRACK;
  let track = opts.loadTrack(trackId);
  const trackOf = (s: BotStateView): Track => {
    const id = s.track || DEFAULT_TRACK;
    if (id !== trackId) {
      trackId = id; // tried once, loaded or not
      try {
        track = opts.loadTrack(id);
      } catch (err) {
        // A track this checkout does not have (another version on the server): keep driving the old one.
        console.warn(`bot: cannot load track "${id}" (${err instanceof Error ? err.message : String(err)}); still driving the last one`);
      }
    }
    return track;
  };

  // Each client plays the seat it has right now: the swap lane trades Pilot and Engineer,
  // and the server ignores controls a seat may not use.
  // Items: the Engineer fires, the Pilot holds Q when the shot should go backward (both halves
  // see the same cars, so they agree).
  const halfFor = (track: Track, seat: string | undefined, car: CarState, memory: BotMemory, others: readonly CarState[]): Omit<InputMessage, 'seq'> => {
    const item = botItem(car, others, tuning, tuning.bot.skill);
    const route = botRoute(car, track, tuning, tuning.bot.skill);
    if (seat === 'engineer') return { ...botPedals(car, track, tuning, memory, route), fire: item.fire };
    const steer = botSteer(car, track, tuning, route);
    return { steer, drift: botDrift(car, track, tuning, steer, tuning.bot.skill, route), aimBack: item.aimBack };
  };
  /** The other cars, rebuilt from synced state (positions are all the item aim needs). */
  const othersIn = (s: BotStateView, track: Track): CarState[] => {
    const out: CarState[] = [];
    s.cars?.forEach((v, id) => {
      if (id !== carId) out.push(carStateFromView(id, v, track, slotStats(roster, s.carModels, Number(id.slice('car'.length)))));
    });
    return out;
  };

  // Pilot half (until a swap): steer toward the look-ahead point on every state update.
  let pilotSeq = 0;
  let pilotHint: number | undefined;
  let pilotTrack = track;
  const pilotMemory = newBotMemory(tuning.bot.skill);
  pilot.onStateChange((s) => {
    const view = s.cars?.get(carId);
    if (!view) return;
    const t = trackOf(s);
    if (t !== pilotTrack) {
      pilotTrack = t;
      pilotHint = undefined; // segment ids belong to the old track
    }
    const car = carStateFromView(carId, view, t, slotStats(roster, s.carModels, slot), pilotHint);
    pilotHint = car.segment;
    if (s.phase !== 'racing') resetStuck(pilotMemory);
    pilot.send(MSG.input, { seq: ++pilotSeq, ...halfFor(t, s.players?.get(pilot.sessionId)?.seat, car, pilotMemory, othersIn(s, t)) });
  });

  // Engineer half: gas/brake for the next corners, respawn when stuck; also counts laps.
  let engSeq = 0;
  let engHint: number | undefined;
  let engTrack = track;
  const memory = newBotMemory(tuning.bot.skill);
  let lastProgress = -1;
  let wraps = 0;
  let lapStart = 0;
  const times: number[] = [];
  engineer.onStateChange((s) => {
    const view = s.cars?.get(carId);
    if (!view) return;
    const t = trackOf(s);
    if (t !== engTrack) {
      engTrack = t;
      engHint = undefined;
      lastProgress = -1; // progress on the old track says nothing about a lap here
    }
    const car = carStateFromView(carId, view, t, slotStats(roster, s.carModels, slot), engHint);
    engHint = car.segment;
    // Controls are ignored outside a race (countdown): standing still there is not stuck.
    if (s.phase !== 'racing') resetStuck(memory);
    // Engineer half (until a swap): pedals, heat, nitro.
    const seat = s.players?.get(engineer.sessionId)?.seat;
    const half = halfFor(t, seat === 'pilot' ? 'pilot' : 'engineer', car, memory, othersIn(s, t));
    // Countdown: a skilled bot hits the gas just before GO (rocket start, P13.3); others wait.
    if (s.phase === 'countdown' && half.gas !== undefined) {
      const left = tuning.race.countdownSeconds - ((s.tick ?? 0) - (s.phaseTick ?? 0)) * tuning.sim.dt;
      half.gas = tuning.bot.skill >= tuning.rocket.botSkill && left <= tuning.rocket.windowSeconds / 2;
    }
    engineer.send(MSG.input, { seq: ++engSeq, ...half });
    if (lastProgress > WRAP && view.progress < 1 - WRAP) {
      wraps++;
      const now = performance.now();
      if (wraps > 1) times.push((now - lapStart) / 1000);
      lapStart = now;
    }
    lastProgress = view.progress;
  });

  return {
    slot,
    track: () => trackId,
    laps: () => Math.max(0, wraps - 1),
    lapTimes: () => [...times],
    stop: async () => {
      await Promise.allSettled([pilot.leave(), engineer.leave()]);
    },
  };
}
