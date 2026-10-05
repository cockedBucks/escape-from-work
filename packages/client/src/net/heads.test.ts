import { describe, expect, it } from 'vitest';
import { HeadSender, HeadSmoother } from './heads';

describe('HeadSender', () => {
  it('sends at most every interval and only when the head moved', () => {
    const s = new HeadSender();
    expect(s.next(0, 0, 0, 50)).toBeNull(); // straight ahead: nothing to say
    expect(s.next(10, 0.5, 0, 50)).toEqual({ yaw: 0.5, pitch: 0 });
    expect(s.next(30, 0.9, 0, 50)).toBeNull(); // too soon
    expect(s.next(70, 0.9, 0, 50)).toEqual({ yaw: 0.9, pitch: 0 });
    expect(s.next(200, 0.902, 0, 50)).toBeNull(); // tiny change
    expect(s.next(300, 0, 0, 50)).toEqual({ yaw: 0, pitch: 0 }); // back to the road: sent
  });
});

describe('HeadSmoother', () => {
  it('eases toward the synced angle instead of jumping', () => {
    const h = new HeadSmoother();
    h.step('a', 0, 0, 0);
    const first = h.step('a', 1, 0, 1 / 60).yaw;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.5);
    let yaw = first;
    for (let i = 0; i < 120; i++) yaw = h.step('a', 1, 0, 1 / 60).yaw;
    expect(yaw).toBeCloseTo(1, 3);
  });
});

describe('HeadSmoother.sweep', () => {
  it('forgets heads that were not drawn in the last frame', () => {
    const h = new HeadSmoother();
    h.step('a', 0, 0, 0.016);
    h.step('b', 0, 0, 0.016);
    h.sweep();
    h.step('a', 0, 0, 0.016);
    h.sweep();
    expect(h.size).toBe(1);
    h.sweep();
    expect(h.size).toBe(0);
  });
});
