import { describe, expect, it } from 'vitest';
import { headKick, Shake, Squash } from './juice';
import { JUICE } from './look';

const run = (step: (dt: number) => void, seconds: number, dt = 1 / 60): void => {
  for (let t = 0; t < seconds; t += dt) step(dt);
};

describe('landing squash', () => {
  it('squashes on landing (lower, wider), stretches past rest, then settles', () => {
    const s = new Squash();
    s.land(8);
    expect(s.scaleY).toBeCloseTo(1 - 8 * JUICE.squashPerImpact);
    expect(s.scaleXZ).toBeGreaterThan(1);
    let tallest = 1;
    for (let i = 0; i < 60; i++) {
      s.step(1 / 60);
      tallest = Math.max(tallest, s.scaleY);
    }
    expect(tallest).toBeGreaterThan(1.02); // the stretch
    run((dt) => s.step(dt), 2);
    expect(s.scaleY).toBe(1);
    expect(s.scaleXZ).toBe(1);
  });

  it('stays stable when frames are slow (one big step)', () => {
    const s = new Squash();
    s.land(9);
    for (let i = 0; i < 10; i++) s.step(0.5);
    expect(s.scaleY).toBe(1);
  });

  it('a huge landing squashes no more than squashMax', () => {
    const s = new Squash();
    s.land(1000);
    expect(s.scaleY).toBeCloseTo(1 - JUICE.squashMax);
  });
});

describe('camera shake', () => {
  it('shakes after a hit, harder for bigger hits (capped), and fades to nothing', () => {
    const small = new Shake();
    const big = new Shake();
    small.hit(5);
    big.hit(10_000);
    expect(big.amp).toBe(JUICE.shakeMax);
    expect(small.amp).toBeLessThan(big.amp);
    let moved = 0;
    for (let i = 0; i < 10; i++) {
      small.step(1 / 60);
      moved = Math.max(moved, Math.abs(small.x), Math.abs(small.y));
    }
    expect(moved).toBeGreaterThan(0);
    run((dt) => small.step(dt), 2);
    expect(small.amp).toBe(0);
    expect(small.x).toBe(0);
  });

  it('a small hit does not cut a big shake short', () => {
    const s = new Shake();
    s.hit(20);
    const amp = s.amp;
    s.hit(1);
    expect(s.amp).toBe(amp);
  });
});

it('head kicks grow with the impact, capped', () => {
  expect(headKick(2)).toBeLessThan(headKick(10));
  expect(headKick(1e6)).toBe(JUICE.headKickMax);
});
