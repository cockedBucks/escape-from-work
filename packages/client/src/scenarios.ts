import {
  NO_INPUT,
  botInput,
  createCar,
  createWorld,
  newBotMemory,
  step,
  createChaos,
  type CarInput,
  type ItemsConfig,
  type Track,
  type Tuning,
  type World,
} from '@escape/shared';
import type { CarSource } from './game';
import type { CarSnap } from './net/snapshots';
import type { ItemsView } from './render/itemProps';

/** Cars in a scenario bot race, and how far into the race the picture is taken (s). */
const SCENARIO_CARS = 4;
const SCENARIO_SECONDS = { chase: 6, cockpit: 6, stall: 6, drift: 6, nitro: 6, items: 2.2, 'track-overview': 0 } as const;
/** Each bot starts this many ticks after the previous one, so they spread out. */
const STAGGER_TICKS = 20;

export type RaceScenario = keyof typeof SCENARIO_SECONDS;

export const isRaceScenario = (s: string | null): s is RaceScenario => s !== null && s in SCENARIO_SECONDS;

/**
 * Run a local bot race to a fixed moment and freeze it there, so every screenshot of the
 * scenario shows exactly the same picture. Uses the same shared sim as the server.
 */
export function frozenBotRace(track: Track, tuning: Tuning, scenario: RaceScenario, items?: ItemsConfig): World {
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
  // `stall`: the car you follow (bot1) has just overheated (smoke, chase view).
  if (scenario === 'stall' && world.cars[0]) {
    world.cars[0].heat = 1;
    world.cars[0].stallUntilTick = world.tick + Math.round(tuning.heat.stallSeconds / tuning.sim.dt);
  }
  // `drift`: the car you follow (bot1) is mid-drift with orange (level 2) sparks.
  if (scenario === 'drift' && world.cars[0]) {
    const car = world.cars[0];
    car.driftDir = 1;
    car.driftLevel = 2;
    car.driftCharge = tuning.drift.levelSeconds[1];
    car.nitro = 0.6;
  }
  // `items`: chaos on, every box up, an envelope flying ahead of bot1, a coffee puddle beside
  // it, and bot1 behind its Firewall.
  if (scenario === 'items' && world.cars[0] && items) {
    const car = world.cars[0];
    world.chaos = createChaos(track, items, 1);
    const f = { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
    const r = { x: f.z, z: -f.x };
    world.chaos.envelopes.push({
      id: 1, owner: car.id, x: car.x + f.x * 9, z: car.z + f.z * 9, vx: f.x * 40, vz: f.z * 40,
      segment: car.segment, ticksLeft: 100, bounces: 0, armedAtTick: 0,
    });
    world.chaos.puddles.push({ id: 2, owner: car.id, x: car.x + f.x * 14 + r.x * 4, z: car.z + f.z * 14 + r.z * 4, ticksLeft: 100, ownerSafeUntilTick: 0, hit: [] });
    car.shieldTicks = 100;
  }
  // `nitro`: the car you follow (bot1) is burning nitro (big flames out the back).
  if (scenario === 'nitro' && world.cars[0]) {
    world.cars[0].nitro = 0.7;
    world.cars[0].nitroOn = true;
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
          stalled: car.stallUntilTick > world.tick,
          drift: car.driftDir,
          driftLevel: car.driftLevel,
          boosting: car.boostTicks > 0,
          nitroOn: car.nitroOn,
          shielded: car.shieldTicks > 0,
        });
      }
    },
  };
}

/** The frozen world's chaos (boxes, envelopes, puddles) for the item props. */
export function frozenItems(world: World): ItemsView | null {
  const chaos = world.chaos;
  if (!chaos) return null;
  return {
    boxesUp: chaos.boxes.map((b) => (b.respawnAtTick > world.tick ? '0' : '1')).join(''),
    shots: [
      ...chaos.envelopes.map((e) => ({ kind: 'mail', x: e.x, z: e.z, vx: 0, vz: 0 })),
      ...chaos.puddles.map((p) => ({ kind: 'coffee', x: p.x, z: p.z, vx: 0, vz: 0 })),
    ],
    shotsTime: 0,
  };
}
