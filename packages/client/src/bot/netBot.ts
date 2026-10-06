// Networked bots: one car = one Pilot-bot client + one Engineer-bot client, each a real
// WebSocket connection that sees only the synced state, exactly like a player's browser.
// Used by `npm run bots` (scripts/bots.mjs) and tests/bot-clients.test.ts. Runs in Node.
import { Client, type EndpointSettings, type Room } from '@colyseus/sdk';
import {
  MSG,
  ROOM_NAME,
  botItem,
  botPedals,
  botRoute,
  botSteer,
  carIdForSlot,
  carStateFromView,
  newBotMemory,
  resetStuck,
  type BotMemory,
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
  players?: {
    forEach(cb: (p: { slot: number; seat: string }, id: string) => void): void;
    get(id: string): { slot: number; seat: string } | undefined;
  };
  cars?: {
    get(id: string): (CarViewLike & { progress: number }) | undefined;
    forEach(cb: (car: CarViewLike & { progress: number }, id: string) => void): void;
  };
}

export interface BotCarOptions {
  endpoint: EndpointSettings;
  tuning: Tuning;
  track: Track;
  stats: CarStats;
  /** Car slot to drive; -1 = first empty car. */
  slot?: number;
  name?: string;
}

export interface BotCar {
  slot: number;
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
  for (const type of [MSG.events, MSG.tuning, MSG.reload]) room.onMessage(type, () => {});
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
  const { endpoint, tuning, track, stats } = opts;
  const pilot = await new Client(endpoint).join<BotStateView>(ROOM_NAME);
  ignoreBroadcasts(pilot);
  const first = await waitFor(pilot, (s) => s.players !== undefined, CONFIRM_MS);
  const slot = opts.slot !== undefined && opts.slot >= 0 ? opts.slot : freeSlot(first, tuning.race.maxCars);
  if (slot < 0) {
    await pilot.leave();
    throw new Error('bot: no empty car left');
  }
  const label = opts.name ?? `Bot ${slot + 1}`;
  pilot.send(MSG.setName, { name: `${label} P` });
  const engineer = await new Client(endpoint).join<BotStateView>(ROOM_NAME);
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
  await waitFor(engineer, (s) => s.cars?.get(carId) !== undefined, CONFIRM_MS);

  // Each client plays the seat it has right now: the swap lane trades Pilot and Engineer,
  // and the server ignores controls a seat may not use.
  // Items: the Engineer fires, the Pilot holds Q when the shot should go backward (both halves
  // see the same cars, so they agree).
  const halfFor = (seat: string | undefined, car: CarState, memory: BotMemory, others: readonly CarState[]): Omit<InputMessage, 'seq'> => {
    const item = botItem(car, others, tuning, tuning.bot.skill);
    const route = botRoute(car, track, tuning, tuning.bot.skill);
    return seat === 'engineer'
      ? { ...botPedals(car, track, tuning, memory, route), fire: item.fire }
      : { steer: botSteer(car, track, tuning, tuning.bot.skill, route), aimBack: item.aimBack };
  };
  /** The other cars, rebuilt from synced state (positions are all the item aim needs). */
  const othersIn = (s: BotStateView): CarState[] => {
    const out: CarState[] = [];
    s.cars?.forEach((v, id) => {
      if (id !== carId) out.push(carStateFromView(id, v, track, stats));
    });
    return out;
  };

  // Pilot half (until a swap): steer toward the look-ahead point on every state update.
  let pilotSeq = 0;
  let pilotHint: number | undefined;
  const pilotMemory = newBotMemory(tuning.bot.skill);
  pilot.onStateChange((s) => {
    const view = s.cars?.get(carId);
    if (!view) return;
    const car = carStateFromView(carId, view, track, stats, pilotHint);
    pilotHint = car.segment;
    if (s.phase !== 'racing') resetStuck(pilotMemory);
    pilot.send(MSG.input, { seq: ++pilotSeq, ...halfFor(s.players?.get(pilot.sessionId)?.seat, car, pilotMemory, othersIn(s)) });
  });

  // Engineer half: gas/brake for the next corners, respawn when stuck; also counts laps.
  let engSeq = 0;
  let engHint: number | undefined;
  const memory = newBotMemory(tuning.bot.skill);
  let lastProgress = -1;
  let wraps = 0;
  let lapStart = 0;
  const times: number[] = [];
  engineer.onStateChange((s) => {
    const view = s.cars?.get(carId);
    if (!view) return;
    const car = carStateFromView(carId, view, track, stats, engHint);
    engHint = car.segment;
    // Controls are ignored outside a race (countdown): standing still there is not stuck.
    if (s.phase !== 'racing') resetStuck(memory);
    // Engineer half (until a swap): pedals, heat, drift taps, nitro.
    const seat = s.players?.get(engineer.sessionId)?.seat;
    engineer.send(MSG.input, { seq: ++engSeq, ...halfFor(seat === 'pilot' ? 'pilot' : 'engineer', car, memory, othersIn(s)) });
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
    laps: () => Math.max(0, wraps - 1),
    lapTimes: () => [...times],
    stop: async () => {
      await Promise.allSettled([pilot.leave(), engineer.leave()]);
    },
  };
}
