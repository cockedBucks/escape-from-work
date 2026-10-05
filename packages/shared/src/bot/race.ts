import type { Tuning } from '../config/tuning';
import type { Track } from '../track/build';
import { createCar, createWorld } from '../sim/car';
import { hashWorld } from '../sim/hash';
import { step } from '../sim/step';
import type { CarInput, CarStats, World } from '../sim/types';
import { botInput } from './driver';
import { newBotMemory, type BotMemory } from './engineer';

export interface BotRaceOptions {
  cars: number;
  laps: number;
  /** Give up after this much race time (s). */
  maxSeconds: number;
  stats?: CarStats;
  /** Bot skill for every car (`BotMemory.skill`): 0 = plain (the default), 2 = drifts + nitro. */
  skill?: number;
  /** Called with every tick's inputs (for recording replays). */
  onInputs?: (inputs: Record<string, CarInput>) => void;
}

export interface BotCarResult {
  id: string;
  /** Seconds per completed lap. */
  lapTimes: number[];
  finished: boolean;
  respawns: number;
  wallHits: number;
}

export interface BotRaceResult {
  finished: boolean;
  seconds: number;
  cars: BotCarResult[];
  hash: string;
  world: World;
}

const DEFAULT_STATS: CarStats = { speed: 1, grip: 1, weight: 1 };

/** Car ids "bot1", "bot2", … lined up across the start line. */
function startingCars(track: Track, count: number, stats: CarStats): ReturnType<typeof createCar>[] {
  const halfWidth = (track.samples[track.gates[0]?.sample ?? 0]?.width ?? 0) / 2;
  return Array.from({ length: count }, (_, i) => {
    // Spread evenly across the middle of the road (cars do not collide with each other yet).
    const lateral = count === 1 ? 0 : (i / (count - 1) - 0.5) * halfWidth;
    return createCar(`bot${i + 1}`, stats, track, 0, lateral);
  });
}

/**
 * A headless race with solo bot cars. A lap counts when a car passes the start gate after
 * all other gates in order. Deterministic: same track, config and options = same result.
 */
export function runBotRace(track: Track, cfg: Tuning, opts: BotRaceOptions): BotRaceResult {
  const world = createWorld(track, startingCars(track, opts.cars, opts.stats ?? DEFAULT_STATS));
  const memory = new Map<string, BotMemory>(world.cars.map((c) => [c.id, newBotMemory(opts.skill ?? 0)]));
  const results = new Map<string, BotCarResult>(
    world.cars.map((c) => [c.id, { id: c.id, lapTimes: [], finished: false, respawns: 0, wallHits: 0 }]),
  );
  const lapStart = new Map<string, number>(world.cars.map((c) => [c.id, 0]));
  const maxTicks = Math.round(opts.maxSeconds / cfg.sim.dt);

  while (world.tick < maxTicks && [...results.values()].some((r) => !r.finished)) {
    const inputs: Record<string, CarInput> = {};
    for (const car of world.cars) {
      if (results.get(car.id)?.finished) continue;
      inputs[car.id] = botInput(car, track, cfg, memory.get(car.id) as BotMemory);
    }
    opts.onInputs?.(inputs);
    for (const e of step(world, inputs, cfg)) {
      const r = results.get(e.car);
      if (!r) continue;
      if (e.type === 'respawn') r.respawns++;
      else if (e.type === 'wallHit') r.wallHits++;
      else if (e.type === 'checkpoint' && e.gate === 0 && !r.finished) {
        r.lapTimes.push((world.tick - (lapStart.get(e.car) ?? 0)) * cfg.sim.dt);
        lapStart.set(e.car, world.tick);
        if (r.lapTimes.length >= opts.laps) r.finished = true;
      }
    }
  }

  const cars = [...results.values()];
  return {
    finished: cars.every((c) => c.finished),
    seconds: world.tick * cfg.sim.dt,
    cars,
    hash: hashWorld(world),
    world,
  };
}
