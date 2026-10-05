import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import { parseTuning } from '../config/tuning';
import { dot, forward, right } from '../util/math';
import { drive, longitudinal, smoothSteer, steerSpeedFactor } from './drive';
import { NO_INPUT, type CarInput, type CarState } from './types';

const cfg = parseTuning(realTuning);
const car = cfg.car;
const dt = cfg.sim.dt;
const gas: CarInput = { ...NO_INPUT, gas: true };
const brake: CarInput = { ...NO_INPUT, brake: true };

function run(vF: number, input: CarInput, seconds: number): number {
  for (let i = 0; i < Math.round(seconds / dt); i++) vF = longitudinal(vF, input, car.topSpeed, car.accel, car, dt);
  return vF;
}

function state(over: Partial<CarState> = {}): CarState {
  return {
    id: 'a', stats: { speed: 1, grip: 1, weight: 1 }, x: 0, z: 0, y: 0, vy: 0, yaw: 0, vx: 0, vz: 0, steer: 0,
    segment: 0, progress: 0, lateral: 0, lastGate: 0, onSlick: false, onRamp: false, respawnAtTick: -1,
    ghostUntilTick: 0, heat: 0, stallUntilTick: -1, driftDir: 0, driftCharge: 0, driftLevel: 0, brakeTicks: 0,
    boostTicks: 0, nitro: 0, nitroOn: false, nextHonkTick: 0, ...over,
  };
}

describe('steering smoothing', () => {
  it('turns in at the rise rate and lets go at the fall rate', () => {
    expect(smoothSteer(0, 1, car, dt)).toBeCloseTo(car.steerRiseRate * dt);
    expect(smoothSteer(1, 0, car, dt)).toBeCloseTo(1 - car.steerFallRate * dt);
    expect(smoothSteer(0.5, -1, car, dt)).toBeCloseTo(0.5 - car.steerFallRate * dt);
    expect(smoothSteer(0, 0, car, dt)).toBe(0);
  });

  it('never goes past the pressed value', () => {
    let s = 0;
    for (let i = 0; i < 200; i++) s = smoothSteer(s, 0.6, car, dt);
    expect(s).toBe(0.6);
    expect(smoothSteer(0, 5, car, 10)).toBe(1);
  });
});

describe('steering vs speed', () => {
  it('cannot turn standing still, full turn at steerFullSpeed, calmer at top speed', () => {
    expect(steerSpeedFactor(0, car.topSpeed, car)).toBe(0);
    expect(steerSpeedFactor(car.steerFullSpeed / 2, car.topSpeed, car)).toBeCloseTo(0.5);
    expect(steerSpeedFactor(car.steerFullSpeed, car.topSpeed, car)).toBeCloseTo(1);
    expect(steerSpeedFactor(car.topSpeed, car.topSpeed, car)).toBeCloseTo(car.steerAtTopSpeed);
    expect(steerSpeedFactor(-car.steerFullSpeed, car.topSpeed, car)).toBeCloseTo(1);
  });
});

describe('gas, brake, reverse, coasting', () => {
  it('accelerates toward top speed and never passes it', () => {
    const after1 = run(0, gas, 1);
    expect(after1).toBeGreaterThan(10);
    const after20 = run(0, gas, 20);
    expect(after20).toBeGreaterThan(car.topSpeed * 0.98);
    expect(after20).toBeLessThanOrEqual(car.topSpeed);
  });

  it('settles back down after going over top speed', () => {
    expect(run(car.topSpeed * 1.5, gas, 3)).toBeLessThan(car.topSpeed * 1.1);
  });

  it('brakes to a stop much faster than coasting', () => {
    const braked = run(25, brake, 0.5);
    const coasted = run(25, NO_INPUT, 0.5);
    expect(braked).toBeLessThan(coasted - 10);
    expect(run(25, brake, 0.7)).toBeLessThanOrEqual(0);
  });

  it('holding brake when stopped reverses, up to reverse top speed', () => {
    const v = run(0, brake, 1);
    expect(v).toBeLessThan(-3);
    expect(run(0, brake, 20)).toBeGreaterThanOrEqual(-car.reverseTopSpeed);
    expect(run(0, brake, 20)).toBeLessThan(-car.reverseTopSpeed * 0.98);
  });

  it('coasting comes to a full stop', () => {
    expect(run(20, NO_INPUT, 30)).toBe(0);
    expect(run(-5, NO_INPUT, 30)).toBe(0);
  });

  it('gas while rolling backwards brakes first', () => {
    expect(run(-5, gas, 0.05)).toBeGreaterThan(-5 + car.brake * 0.04);
  });

  it('gas plus brake while stopped stays put', () => {
    expect(run(0, { ...NO_INPUT, gas: true, brake: true }, 1)).toBe(0);
  });

  it('a faster car (stats.speed) is faster', () => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < 120; i++) {
      a = longitudinal(a, gas, car.topSpeed, car.accel, car, dt);
      b = longitudinal(b, gas, car.topSpeed * 1.08, car.accel * 1.08, car, dt);
    }
    expect(b).toBeGreaterThan(a);
  });
});

describe('drive (whole ground step)', () => {
  it('grip removes sideways sliding; slick keeps more of it', () => {
    const r = right(0);
    const dry = state({ vx: r.x * 10, vz: r.z * 10 });
    const slick = state({ vx: r.x * 10, vz: r.z * 10, onSlick: true });
    for (let i = 0; i < 30; i++) {
      drive(dry, NO_INPUT, car, cfg, dt);
      drive(slick, NO_INPUT, car, cfg, dt);
    }
    const side = (s: CarState): number => Math.abs(dot({ x: s.vx, z: s.vz }, r));
    expect(side(dry)).toBeLessThan(0.2);
    expect(side(slick)).toBeGreaterThan(side(dry) * 5);
  });

  it('steering right lowers yaw going forward and raises it in reverse', () => {
    const fwd = state({ vx: forward(0).x * 15, vz: forward(0).z * 15 });
    const rev = state({ vx: forward(0).x * -5, vz: forward(0).z * -5 });
    for (let i = 0; i < 20; i++) {
      drive(fwd, { ...NO_INPUT, steer: 1 }, car, cfg, dt);
      drive(rev, { ...NO_INPUT, steer: 1, brake: true }, car, cfg, dt);
    }
    expect(fwd.yaw).toBeLessThan(-0.1);
    expect(rev.yaw).toBeGreaterThan(0.05);
  });

  it('does not turn when stopped', () => {
    const s = state();
    for (let i = 0; i < 60; i++) drive(s, { ...NO_INPUT, steer: 1 }, car, cfg, dt);
    expect(s.yaw).toBe(0);
    expect(s.steer).toBe(1);
  });
});

describe('carve and engine curve (P2.8 feel pass)', () => {
  /** Sideways slide speed after turning at full lock for `ticks`, with a given carve. */
  function slideAfterTurn(carve: number, onSlick = false): number {
    const tuned = { ...car, carve };
    const s = state({ vx: forward(0).x * 20, vz: forward(0).z * 20, steer: 1, onSlick });
    for (let i = 0; i < 30; i++) drive(s, { ...NO_INPUT, gas: true, steer: 1 }, tuned, cfg, dt);
    return Math.abs(dot({ x: s.vx, z: s.vz }, right(s.yaw)));
  }

  it('carve makes the car follow its nose instead of sliding sideways', () => {
    expect(slideAfterTurn(0.8)).toBeLessThan(slideAfterTurn(0) * 0.5);
    expect(slideAfterTurn(1)).toBeLessThan(0.01);
  });

  it('on a slick the car carves less and slides more', () => {
    expect(slideAfterTurn(0.8, true)).toBeGreaterThan(slideAfterTurn(0.8) * 2);
  });

  it('a higher engine curve keeps the pull strong near top speed', () => {
    const timeTo90 = (accelCurve: number): number => {
      const tuned = { ...car, accelCurve };
      let v = 0;
      let t = 0;
      while (v < car.topSpeed * 0.9 && t < 30) {
        v = longitudinal(v, gas, car.topSpeed, car.accel, tuned, dt);
        t += dt;
      }
      return t;
    };
    expect(timeTo90(2)).toBeLessThan(timeTo90(1) * 0.75);
  });
});
