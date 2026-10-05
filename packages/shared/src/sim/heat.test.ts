import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import { parseTuning } from '../config/tuning';
import { isStalled, stepHeat } from './heat';
import { NO_INPUT, type CarInput, type CarState, type SimEvent } from './types';

const cfg = parseTuning(realTuning);
const h = cfg.heat;
const dt = cfg.sim.dt;
const top = cfg.car.topSpeed;
const FAST = top * (h.hotSpeedFraction + 0.1);
const SLOW = top * (h.hotSpeedFraction - 0.2);
const GAS: CarInput = { ...NO_INPUT, gas: true };

const car = (heat = 0): CarState => ({ id: 'a', stats: { speed: 1, grip: 1, weight: 1 }, heat, stallUntilTick: -1 }) as CarState;

/** Run `seconds` of ticks from tick 1; returns the events and the input of the last tick. */
function run(c: CarState, input: CarInput, speed: number, seconds: number, start = 1) {
  const events: SimEvent[] = [];
  let used: CarInput = input;
  const n = Math.round(seconds / dt);
  for (let t = start; t < start + n; t++) used = stepHeat(c, input, speed, cfg, t, events);
  return { events, used, end: start + n };
}

describe('engine heat', () => {
  it('rises at full gas above the hot speed, at risePerSec', () => {
    const c = car();
    run(c, GAS, FAST, 1);
    expect(c.heat).toBeCloseTo(h.risePerSec, 2);
  });

  it('holds with gas at low speed, cools off the gas or braking', () => {
    const c = car(0.5);
    run(c, GAS, SLOW, 1);
    expect(c.heat).toBeCloseTo(0.5, 6);
    run(c, NO_INPUT, FAST, 0.5);
    expect(c.heat).toBeCloseTo(0.5 - h.coolPerSec * 0.5, 2);
    const braking = car(0.5);
    run(braking, { ...GAS, brake: true }, FAST, 0.5);
    expect(braking.heat).toBeCloseTo(0.5 - h.coolPerSec * 0.5, 2);
  });

  it('never goes below 0', () => {
    const c = car(0.1);
    run(c, NO_INPUT, 0, 2);
    expect(c.heat).toBe(0);
  });

  it('stalls at full heat: no gas for stallSeconds, then restarts at restartHeat', () => {
    const c = car(0.99);
    const first = run(c, GAS, FAST, 0.1);
    expect(first.events).toEqual([{ type: 'stall', car: 'a' }]);
    expect(first.used.gas).toBe(false);
    expect(isStalled(c, first.end)).toBe(true);
    // Still stalled just before the end (gas ignored, brake and steering pass through).
    const mid = run(c, { ...GAS, steer: 1, brake: true }, FAST, h.stallSeconds - 0.2, first.end);
    expect(mid.used).toEqual({ ...NO_INPUT, steer: 1, brake: true });
    expect(mid.events).toEqual([]);
    // Restarts once the time is up.
    const after = run(c, NO_INPUT, 0, 0.3, mid.end);
    expect(after.events).toEqual([{ type: 'restart', car: 'a' }]);
    expect(isStalled(c, after.end)).toBe(false);
    expect(c.heat).toBeGreaterThan(h.restartHeat - h.coolPerSec * 0.3 - 1e-6);
    expect(c.heat).toBeLessThanOrEqual(h.restartHeat);
  });

  it('a faster car (stats.speed) needs more speed to heat up', () => {
    const quick = { ...car(), stats: { speed: 1.5, grip: 1, weight: 1 } };
    run(quick, GAS, FAST, 1);
    expect(quick.heat).toBe(0);
  });
});
