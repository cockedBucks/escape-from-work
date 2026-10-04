import {
  NO_INPUT,
  botInput,
  createCar,
  createWorld,
  newBotMemory,
  step,
  type CarInput,
  type Track,
  type Tuning,
  type World,
} from '@escape/shared';
import type { CarSource } from './game';
import type { CarSnap } from './net/snapshots';

/** Cars in a scenario bot race, and how far into the race the picture is taken (s). */
const SCENARIO_CARS = 4;
const SCENARIO_SECONDS = { chase: 6, 'track-overview': 0 } as const;
/** Each bot starts this many ticks after the previous one, so they spread out. */
const STAGGER_TICKS = 20;

export type RaceScenario = keyof typeof SCENARIO_SECONDS;

export const isRaceScenario = (s: string | null): s is RaceScenario => s !== null && s in SCENARIO_SECONDS;

/**
 * Run a local bot race to a fixed moment and freeze it there, so every screenshot of the
 * scenario shows exactly the same picture. Uses the same shared sim as the server.
 */
export function frozenBotRace(track: Track, tuning: Tuning, scenario: RaceScenario): World {
  const halfWidth = (track.samples[track.gates[0]?.sample ?? 0]?.width ?? 0) / 2;
  const cars = Array.from({ length: SCENARIO_CARS }, (_, i) =>
    createCar(`bot${i + 1}`, { speed: 1, grip: 1, weight: 1 }, track, 0, (i / (SCENARIO_CARS - 1) - 0.5) * halfWidth),
  );
  const world = createWorld(track, cars);
  const memory = new Map(world.cars.map((c) => [c.id, newBotMemory()]));
  const ticks = Math.round(SCENARIO_SECONDS[scenario] / tuning.sim.dt);
  for (let t = 0; t < ticks; t++) {
    const inputs: Record<string, CarInput> = {};
    // Stagger the bots a little so they do not drive as one block.
    for (const [i, car] of world.cars.entries()) {
      inputs[car.id] = t < i * STAGGER_TICKS ? NO_INPUT : botInput(car, track, tuning, memory.get(car.id)!);
    }
    step(world, inputs, tuning);
  }
  return world;
}

/** A car source that always shows the same frozen world. */
export function frozenSource(world: World): CarSource {
  return {
    sample(_now: number, out: Map<string, CarSnap>): void {
      for (const car of world.cars) {
        out.set(car.id, {
          x: car.x,
          y: car.y,
          z: car.z,
          yaw: car.yaw,
          speed: Math.hypot(car.vx, car.vz),
          steer: car.steer,
          respawning: car.respawnAtTick >= 0,
          ghost: car.ghostUntilTick > world.tick,
        });
      }
    },
  };
}
