import { describe, expect, it } from 'vitest';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { mergeCarInput } from '../net/permissions';
import { buildTrack } from '../track/build';
import { dot, forward } from '../util/math';
import { createCar, createWorld } from './car';
import { stepHeat } from './heat';
import { stepNitro } from './nitro';
import { step } from './step';
import { NO_INPUT, type CarInput, type SimEvent, type World } from './types';

const cfg = parseTuning(realTuning);
const dt = cfg.sim.dt;
const top = cfg.car.topSpeed;
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const secs = (s: number): number => Math.round(s / dt);
const GAS: CarInput = { ...NO_INPUT, gas: true };
const NITRO: CarInput = { ...GAS, nitro: true };

function world(meter: number): World {
  const w = createWorld(track, [createCar('a', { speed: 1, grip: 1, weight: 1 }, track)]);
  w.cars[0]!.nitro = meter;
  return w;
}

function run(w: World, input: CarInput, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...step(w, { a: input }, cfg));
  return events;
}

const vF = (w: World): number => dot({ x: w.cars[0]!.vx, z: w.cars[0]!.vz }, forward(w.cars[0]!.yaw));

describe('nitro', () => {
  it('burns the meter at burnPerSec while held, with one event per burn', () => {
    const w = world(1);
    const events = run(w, NITRO, secs(1));
    expect(w.cars[0]!.nitro).toBeCloseTo(1 - cfg.nitro.burnPerSec, 2);
    expect(events.filter((e) => e.type === 'nitro')).toEqual([{ type: 'nitro', car: 'a' }]);
    run(w, GAS, 1);
    expect(w.cars[0]!.nitroOn).toBe(false);
  });

  it('pushes the car faster than gas alone, past normal top speed', () => {
    const plain = world(0);
    const boosted = world(1);
    run(plain, GAS, secs(2));
    run(boosted, NITRO, secs(2));
    expect(vF(boosted)).toBeGreaterThan(vF(plain) + 3);
    const fast = world(1);
    const c = fast.cars[0]!;
    const f = forward(c.yaw);
    c.vx = f.x * top;
    c.vz = f.z * top;
    run(fast, NITRO, secs(0.5));
    expect(vF(fast)).toBeGreaterThan(top);
    expect(vF(fast)).toBeLessThanOrEqual(top * cfg.nitro.topSpeed + 1e-6);
  });

  it('does nothing with an empty meter', () => {
    const w = world(0);
    expect(run(w, NITRO, 10).some((e) => e.type === 'nitro')).toBe(false);
    expect(w.cars[0]!.nitroOn).toBe(false);
  });

  it('adds nitroRisePerSec heat on top, even at low speed', () => {
    const c = createCar('a', { speed: 1, grip: 1, weight: 1 }, track);
    c.nitro = 1;
    const events: SimEvent[] = [];
    for (let t = 1; t <= secs(1); t++) {
      stepNitro(c, NITRO, cfg, t, events);
      stepHeat(c, NITRO, 0, cfg, t, events);
    }
    expect(c.heat).toBeCloseTo(cfg.heat.nitroRisePerSec, 2);
  });

  it('a stalled engine cannot burn nitro', () => {
    const c = createCar('a', { speed: 1, grip: 1, weight: 1 }, track);
    c.nitro = 1;
    c.stallUntilTick = 100;
    stepNitro(c, NITRO, cfg, 50, []);
    expect(c.nitroOn).toBe(false);
    expect(c.nitro).toBe(1);
  });

  it('only the Engineer (or a solo player) fires nitro', () => {
    expect(mergeCarInput([{ role: 'pilot', input: NITRO }]).nitro ?? false).toBe(false);
    expect(mergeCarInput([{ role: 'engineer', input: NITRO }]).nitro).toBe(true);
    expect(mergeCarInput([{ role: 'solo', input: NITRO }]).nitro).toBe(true);
  });
});
