import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import { parseTuning } from '../config/tuning';
import { createCar } from './car';
import { driftSteer, drive } from './drive';
import { stepDrift } from './drift';
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

/** A car moving forward at `speed` with the wheel already turned to `steer`. */
function fastCar(speed = top * 0.8, steer = 1): CarState {
  const c = createCar('a', { speed: 1, grip: 1, weight: 1 }, track);
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
    const used = stepDrift(c, input, vF(c), cfg, events);
    drive(c, used, cfg.car, cfg, dt);
  }
  return events;
}

const STEER_R: CarInput = { ...NO_INPUT, steer: 1 };
/** Ticks the steering must stay straight before a drift lets go. */
const RELEASE = secs(d.releaseMs / 1000);
const TAP: CarInput = { ...STEER_R, brake: true };

/** Start a drift to the right: brake tapped (2 ticks) while steering hard. */
function startDrift(c: CarState): void {
  run(c, TAP, 2);
  run(c, STEER_R, 1);
}

describe('tandem drift', () => {
  it('starts on a brake tap while steering hard at speed, in the steering direction', () => {
    const c = fastCar();
    startDrift(c);
    expect(c.driftDir).toBe(1);
    const left = fastCar(top * 0.8, -1);
    run(left, { ...TAP, steer: -1 }, 1);
    expect(left.driftDir).toBe(-1);
  });

  it('does not start when steering lightly, too slow, or without a fresh press', () => {
    const light = fastCar(top * 0.8, d.minSteer - 0.1);
    run(light, { ...TAP, steer: d.minSteer - 0.1 }, 1);
    expect(light.driftDir).toBe(0);
    const slow = fastCar(top * d.minSpeedRatio * 0.8);
    run(slow, TAP, 1);
    expect(slow.driftDir).toBe(0);
    // Brake already held before steering hard: braking, not a tap.
    const held = fastCar(top * 0.8, 0);
    run(held, { ...NO_INPUT, brake: true }, 1);
    held.steer = 1;
    run(held, TAP, 1);
    expect(held.driftDir).toBe(0);
  });

  it('the tap does not brake, but holding the brake ends the drift with no reward', () => {
    const c = fastCar();
    const before = vF(c);
    run(c, TAP, secs(d.brakeTapMaxMs / 1000) - 1);
    expect(c.driftDir).toBe(1);
    expect(before - vF(c)).toBeLessThan(cfg.car.brake * (d.brakeTapMaxMs / 1000) * 0.3);
    const events = run(c, TAP, 3);
    expect(c.driftDir).toBe(0);
    expect(events.filter((e) => e.type === 'boost')).toEqual([]);
  });

  it('charges blue → orange → pink, then releasing on the gas boosts and fills nitro', () => {
    const c = fastCar();
    startDrift(c);
    const levels = run(c, { ...STEER_R, gas: true }, secs(d.levelSeconds[2] + 0.1)).filter((e) => e.type === 'driftLevel');
    expect(levels.map((e) => (e as { level: number }).level)).toEqual([1, 2, 3]);
    const release = run(c, { ...NO_INPUT, gas: true }, RELEASE);
    expect(release).toContainEqual({ type: 'boost', car: 'a', level: 3 });
    expect(c.driftDir).toBe(0);
    expect(c.nitro).toBeCloseTo(d.nitroPerLevel[2], 6);
    expect(c.boostTicks).toBeGreaterThan(0);
    // The boost pushes past normal top speed.
    run(c, { ...NO_INPUT, gas: true }, secs(d.boostSeconds[2] - 0.1));
    expect(vF(c)).toBeGreaterThan(top);
  });

  it('releasing off the gas gives no boost and no nitro; level 0 never boosts', () => {
    const c = fastCar();
    startDrift(c);
    run(c, STEER_R, secs(d.levelSeconds[0] + 0.1));
    expect(run(c, NO_INPUT, RELEASE).some((e) => e.type === 'boost')).toBe(false);
    expect(c.nitro).toBe(0);
    const quick = fastCar();
    startDrift(quick);
    expect(run(quick, { ...NO_INPUT, gas: true }, RELEASE).some((e) => e.type === 'boost')).toBe(false);
  });

  it('a quick tap off the steering key does not end the drift; holding straight does', () => {
    const c = fastCar();
    startDrift(c);
    run(c, { ...NO_INPUT, gas: true }, RELEASE - 2);
    expect(c.driftDir).toBe(1);
    run(c, { ...STEER_R, gas: true }, 5); // back on the key: the grace starts over
    run(c, { ...NO_INPUT, gas: true }, RELEASE - 2);
    expect(c.driftDir).toBe(1);
    run(c, { ...NO_INPUT, gas: true }, 2);
    expect(c.driftDir).toBe(0);
  });

  it('ends with no reward when the car gets too slow', () => {
    const c = fastCar();
    startDrift(c);
    const f = forward(c.yaw);
    c.vx = f.x * top * d.exitSpeedRatio * 0.5;
    c.vz = f.z * top * d.exitSpeedRatio * 0.5;
    run(c, { ...STEER_R, gas: true }, 1);
    expect(c.driftDir).toBe(0);
  });

  it('slides wider than normal cornering, and steering out of the drift turns less', () => {
    const drifting = fastCar();
    startDrift(drifting);
    const normal = fastCar();
    run(drifting, STEER_R, secs(0.5));
    run(normal, STEER_R, secs(0.5) + 3);
    expect(vS(drifting)).toBeGreaterThan(vS(normal) * 2);
    expect(Math.abs(driftSteer(1, -1, d))).toBeLessThan(Math.abs(driftSteer(1, 1, d)));
    expect(Math.sign(driftSteer(1, -1, d))).toBe(1); // still turning into the drift
  });

  it('nitro never goes past a full meter', () => {
    const c = fastCar();
    c.nitro = 0.95;
    startDrift(c);
    run(c, { ...STEER_R, gas: true }, secs(d.levelSeconds[2] + 0.1));
    run(c, { ...NO_INPUT, gas: true }, RELEASE);
    expect(c.nitro).toBe(1);
  });
});
