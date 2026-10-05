import { describe, expect, it } from 'vitest';
import { Wobble } from './bobblehead';
import { HEAD } from './look';

describe('bobblehead wobble', () => {
  it('braking tips the head one way, gas the other, then it settles', () => {
    const brake = new Wobble();
    const gas = new Wobble();
    for (let i = 0; i < 10; i++) {
      brake.step(-20, 0, 1 / 60);
      gas.step(15, 0, 1 / 60);
    }
    expect(brake.pitch).toBeLessThan(0);
    expect(gas.pitch).toBeGreaterThan(0);
    for (let i = 0; i < 600; i++) brake.step(0, 0, 1 / 60);
    expect(Math.abs(brake.pitch)).toBeLessThan(0.01);
  });

  it('turning swings it sideways; a huge jolt is capped', () => {
    const w = new Wobble();
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      w.step(0, 500, 1 / 60);
      peak = Math.max(peak, Math.abs(w.roll));
    }
    expect(w.roll).toBeGreaterThan(0);
    // The target is capped at wobbleMax; a bouncy spring may overshoot it, but not wildly.
    expect(peak).toBeLessThan(HEAD.wobbleMax * 2);
  });
});
