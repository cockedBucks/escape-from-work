import { describe, expect, it } from 'vitest';
import type { CarSnap } from '../net/snapshots';
import { SMOKE } from './look';
import { Smoke, puffSize } from './smoke';

const snap = (stalled: boolean): CarSnap => ({
  x: 0, y: 0, z: 0, yaw: 0, speed: 0, steer: 0, respawning: false, ghost: false, stalled, drift: 0, driftLevel: 0, boosting: false,
});

describe('smoke', () => {
  it('a puff swells to its peak, then shrinks to nothing', () => {
    expect(puffSize(0.001)).toBeCloseTo(SMOKE.startSize, 2);
    expect(puffSize(1 / 3)).toBeCloseTo(SMOKE.peakSize, 6);
    expect(puffSize(1)).toBe(0);
    expect(puffSize(0.9)).toBeLessThan(puffSize(0.5));
  });

  it('only stalled cars puff, at the emit rate, and puffs die after their life', () => {
    const smoke = new Smoke('normal');
    const cars = new Map([['a', snap(true)], ['b', snap(false)]]);
    smoke.update(0, 0, cars);
    smoke.update(SMOKE.emitEveryMs / 2, 0.01, cars); // too soon for another puff
    expect(smoke.mesh.count).toBe(1);
    smoke.update(SMOKE.emitEveryMs, 0.01, cars);
    expect(smoke.mesh.count).toBe(2);
    cars.set('a', snap(false));
    smoke.update(5000, SMOKE.lifeSeconds, cars);
    smoke.update(5001, 0.01, cars);
    expect(smoke.mesh.count).toBe(0);
    smoke.dispose();
  });

  it('never grows past the pool', () => {
    const smoke = new Smoke('normal');
    const cars = new Map([['a', snap(true)]]);
    for (let i = 0; i < SMOKE.maxPuffs * 3; i++) smoke.update(i * SMOKE.emitEveryMs, 0.001, cars);
    expect(smoke.mesh.count).toBe(SMOKE.maxPuffs);
    smoke.dispose();
  });
});
