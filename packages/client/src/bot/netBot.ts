// Networked bots: one car = one Pilot-bot client + one Engineer-bot client, each a real
// WebSocket connection that sees only the synced state, exactly like a player's browser.
// Used by `npm run bots` (scripts/bots.mjs) and tests/bot-clients.test.ts. Runs in Node.
import { Client, type EndpointSettings, type Room } from '@colyseus/sdk';
import {
  MSG,
  ROOM_NAME,
  botPedals,
  botSteer,
  carIdForSlot,
  carStateFromView,
  newBotMemory,
  type CarStats,
  type CarViewLike,
  type Track,
  type Tuning,
} from '@escape/shared';

interface BotStateView {
  players?: { forEach(cb: (p: { slot: number; seat: string }, id: string) => void): void };
  cars?: { get(id: string): (CarViewLike & { progress: number }) | undefined };
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
  for (const type of [MSG.events, MSG.tuning, MSG.reload, MSG.lobbyError]) room.onMessage(type, () => {});
}

/** Start one bot car (two clients). Resolves once both bots are seated. */
export async function startBotCar(opts: BotCarOptions): Promise<BotCar> {
  const { endpoint, tuning, track, stats } = opts;
  const pilot = await new Client(endpoint).join<BotStateView>(ROOM_NAME);
  ignoreBroadcasts(pilot);
  const first =await waitFor(pilot, (s) => s.players !== undefined, CONFIRM_MS);
  const slot = opts.slot !== undefined && opts.slot >= 0 ? opts.slot : freeSlot(first, tuning.race.maxCars);
  if (slot < 0) {
    await pilot.leave();
    throw new Error('bot: no empty car left');
  }
  const label = opts.name ?? `Bot ${slot + 1}`;
  pilot.send(MSG.setName, { name: `${label} P` });
  pilot.send(MSG.setSeat, { slot, seat: 'pilot' });
  const engineer = await new Client(endpoint).join<BotStateView>(ROOM_NAME);
  ignoreBroadcasts(engineer);
  engineer.send(MSG.setName, { name: `${label} E` });
  engineer.send(MSG.setSeat, { slot, seat: 'engineer' });

  const carId = carIdForSlot(slot);
  await waitFor(engineer, (s) => s.cars?.get(carId) !== undefined, CONFIRM_MS);

  // Pilot half: steer toward the look-ahead point on every state update.
  let pilotSeq = 0;
  let pilotHint: number | undefined;
  pilot.onStateChange((s) => {
    const view = s.cars?.get(carId);
    if (!view) return;
    const car = carStateFromView(carId, view, track, stats, pilotHint);
    pilotHint = car.segment;
    pilot.send(MSG.input, { seq: ++pilotSeq, steer: botSteer(car, track, tuning.bot) });
  });

  // Engineer half: gas/brake for the next corners, respawn when stuck; also counts laps.
  let engSeq = 0;
  let engHint: number | undefined;
  const memory = newBotMemory();
  let lastProgress = -1;
  let wraps = 0;
  let lapStart = 0;
  const times: number[] = [];
  engineer.onStateChange((s) => {
    const view = s.cars?.get(carId);
    if (!view) return;
    const car = carStateFromView(carId, view, track, stats, engHint);
    engHint = car.segment;
    const pedals = botPedals(car, track, tuning, memory);
    engineer.send(MSG.input, { seq: ++engSeq, ...pedals });
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
