import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { buildTrack } from '../track/build';
import { forward } from '../util/math';
import { createCar, createWorld } from './car';
import { step } from './step';
import { NO_INPUT, type CarInput, type SimEvent, type World } from './types';

const cfg = parseTuning(realTuning);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);

/** One car on the start straight, `height` m in the air, rising at `vy`, at speed. */
function flying(height: number, vy = 4): World {
  const car = createCar('a', { speed: 1, grip: 1, weight: 1 }, track);
  const f = forward(car.yaw);
  car.vx = f.x * 20;
  car.vz = f.z * 20;
  car.y = height;
  car.vy = vy;
  return createWorld(track, [car]);
}

function run(world: World, inputs: CarInput[]): SimEvent[] {
  const events: SimEvent[] = [];
  for (const input of inputs) events.push(...step(world, { a: input }, cfg));
  return events;
}

const SPACE: CarInput = { ...NO_INPUT, gas: true, drift: true };
const GAS: CarInput = { ...NO_INPUT, gas: true };
const types = (ev: SimEvent[]): string[] => ev.filter((e) => e.type === 'trick' || e.type === 'trickLand').map((e) => e.type);

describe('jump tricks (P13.5)', () => {
  it('Space pressed high in the air = a trick; landing it = a boost', () => {
    const world = flying(cfg.trick.minHeight + 0.5);
    const car = world.cars[0]!;
    const ev = run(world, [SPACE]);
    expect(car.trick).toBe(1);
    for (let i = 0; i < 120 && car.trick === 1; i++) ev.push(...run(world, [GAS]));
    expect(types(ev)).toEqual(['trick', 'trickLand']);
    expect(car.y).toBe(0);
    expect(car.boostTicks).toBe(Math.round(cfg.trick.boostSeconds / cfg.sim.dt));
  });

  it('one trick per jump, only on a fresh press, not too low', () => {
    expect(types(run(flying(cfg.trick.minHeight + 0.5), [SPACE, GAS, SPACE, ...Array<CarInput>(120).fill(GAS)]))).toEqual(['trick', 'trickLand']);
    // Held since the ground (no fresh press in the air): no trick.
    const held = flying(cfg.trick.minHeight + 0.5);
    held.cars[0]!.driftKeyTicks = 5;
    expect(types(run(held, Array<CarInput>(120).fill(SPACE)))).toEqual([]);
    // A tiny hop: below minHeight.
    expect(types(run(flying(0.05, 0.5), [SPACE, ...Array<CarInput>(60).fill(GAS)]))).toEqual([]);
  });
});
