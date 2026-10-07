import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import { parseTuning } from '../config/tuning';
import { createCar } from './car';
import { driftSteer, drive } from './drive';
import { cancelDrift, stepDrift } from './drift';
import { NO_INPUT, type CarInput, type CarState, type SimEvent } from './types';
import { buildTrack } from '../track/build';
import { parseTrack } from '../config/track';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import { dot, forward, right } from '../util/math';

const cfg = parseTuning(realTuning);
const d = cfg.drift;
const dt = cfg.sim.dt;
const top = cfg.car.topSpeed;
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const secs = (s: number): number => Math.round(s / dt);

/** A car moving forward at `speed` with the wheel already turned to `steer` (on the start straight). */
function fastCar(speed = top * 0.8, steer = 1, at?: number): CarState {
  const c = createCar('a', { speed: 1, grip: 1, weight: 1 }, track);
  if (at !== undefined) {
    const sample = track.samples[at]!;
    c.x = sample.pos.x;
    c.z = sample.pos.z;
    c.yaw = Math.atan2(sample.dir.x, sample.dir.z);
    c.segment = at;
  }
  const f = forward(c.yaw);
  c.vx = f.x * speed;
  c.vz = f.z * speed;
  c.steer = steer;
  return c;
}

const vF = (c: CarState): number => dot({ x: c.vx, z: c.vz }, forward(c.yaw));
const vS = (c: CarState): number => Math.abs(dot({ x: c.vx, z: c.vz }, right(c.yaw)));

/** Drift + drive for `n` ticks with one input; returns the events. */
function run(c: CarState, input: CarInput, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const used = stepDrift(c, input, vF(c), track, cfg, events);
    drive(c, used, cfg.car, cfg, dt);
  }
  return events;
}

const STEER_R: CarInput = { ...NO_INPUT, steer: 1 };
const SPACE_R: CarInput = { ...STEER_R, drift: true, gas: true };
const GAS: CarInput = { ...NO_INPUT, gas: true };
/** The tightest bend of the test loop, and a sample a little before it. */
const bend = track.samples.reduce((best, x, i) => (Math.abs(x.curvature) > Math.abs(track.samples[best]!.curvature) ? i : best), 0);
const beforeBend = (bend - 3 + track.samples.length) % track.samples.length;

describe('kart drift (Space)', () => {
  it('starts when Space is held at speed, toward the steering', () => {
    const c = fastCar();
    const ev = run(c, SPACE_R, 1);
    expect(c.driftDir).toBe(1);
    expect(ev).toContainEqual({ type: 'driftStart', car: 'a', dir: 1 });
    const left = fastCar(top * 0.8, -1);
    run(left, { ...SPACE_R, steer: -1 }, 1);
    expect(left.driftDir).toBe(-1);
  });

  it('needs no steering: with the wheel straight it drifts into the bend ahead', () => {
    const c = fastCar(top * 0.8, 0, beforeBend);
    run(c, { ...GAS, drift: true }, 1);
    expect(c.driftDir).toBe(-Math.sign(track.samples[bend]!.curvature));
  });

  it('on a straight with no steering it waits (armed) and starts once you steer', () => {
    const c = fastCar(top * 0.8, 0);
    run(c, { ...GAS, drift: true }, 5);
    expect(c.driftDir).toBe(0);
    run(c, { ...GAS, drift: true, steer: -1 }, 1);
    expect(c.driftDir).toBe(-1);
  });

  it('does not start too slow, in the air, or without Space', () => {
    const slow = fastCar(top * d.minSpeedRatio * 0.5);
    run(slow, SPACE_R, 3);
    expect(slow.driftDir).toBe(0);
    const air = fastCar();
    air.y = 1;
    run(air, SPACE_R, 1);
    expect(air.driftDir).toBe(0);
    const noKey = fastCar();
    run(noKey, { ...STEER_R, gas: true }, 3);
    expect(noKey.driftDir).toBe(0);
  });

  it('keeps drifting while held, even with the steering straight (it follows the road)', () => {
    const c = fastCar();
    run(c, SPACE_R, 1);
    run(c, { ...GAS, drift: true }, secs(0.5));
    expect(c.driftDir).toBe(1);
  });

  it('charges blue → orange → pink; letting go of Space boosts and fills nitro', () => {
    const c = fastCar();
    const ev = run(c, SPACE_R, secs(d.levelSeconds[2] + 0.05));
    expect(ev.filter((e) => e.type === 'driftLevel').map((e) => (e as { level: number }).level)).toEqual([1, 2, 3]);
    const out = run(c, GAS, 1);
    expect(out).toContainEqual({ type: 'boost', car: 'a', level: 3 });
    expect(c.driftDir).toBe(0);
    expect(c.boostTicks).toBeGreaterThan(0);
    expect(c.nitro).toBeCloseTo(d.nitroPerLevel[2]);
  });

  it('letting go before the first level gives nothing', () => {
    const c = fastCar();
    run(c, SPACE_R, secs(d.levelSeconds[0] * 0.5));
    const out = run(c, GAS, 1);
    expect(out.some((e) => e.type === 'boost')).toBe(false);
    expect(c.nitro).toBe(0);
  });

  it('ends with no reward when the car gets too slow', () => {
    const c = fastCar();
    run(c, SPACE_R, secs(d.levelSeconds[0] + 0.05));
    const f = forward(c.yaw);
    c.vx = f.x * top * d.exitSpeedRatio * 0.5;
    c.vz = f.z * top * d.exitSpeedRatio * 0.5;
    const out = run(c, SPACE_R, 1);
    expect(c.driftDir).toBe(0);
    expect(out.some((e) => e.type === 'boost')).toBe(false);
  });

  it('cancelDrift (spin-out, respawn) ends it with no boost', () => {
    const c = fastCar();
    run(c, SPACE_R, secs(d.levelSeconds[1] + 0.05));
    const ev: SimEvent[] = [];
    cancelDrift(c, cfg, ev);
    expect(c.driftDir).toBe(0);
    expect(ev).toEqual([]);
    expect(c.boostTicks).toBe(0);
  });

  it('slides wider than normal cornering, and steering out of the drift turns less', () => {
    const drifting = fastCar();
    const normal = fastCar();
    run(drifting, SPACE_R, secs(0.5));
    run(normal, STEER_R, secs(0.5));
    expect(vS(drifting)).toBeGreaterThan(vS(normal) * 2);
    expect(Math.abs(driftSteer(1, -1, d))).toBeLessThan(Math.abs(driftSteer(1, 1, d)));
    expect(Math.sign(driftSteer(1, -1, d))).toBe(1); // still turning into the drift
  });

  it('nitro never goes past a full meter', () => {
    const c = fastCar();
    c.nitro = 0.95;
    run(c, SPACE_R, secs(d.levelSeconds[2] + 0.1));
    run(c, GAS, 1);
    expect(c.nitro).toBe(1);
  });
});
