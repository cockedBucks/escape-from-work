import { describe, expect, it } from 'vitest';
import { TokenBucket } from './rateLimit';

describe('TokenBucket', () => {
  it('allows a burst, then only the refill rate', () => {
    let now = 0;
    const bucket = new TokenBucket(10, 5, () => now);
    const burst = Array.from({ length: 8 }, () => bucket.take());
    expect(burst.filter(Boolean).length).toBe(5);
    now += 100; // 0.1 s at 10/s = 1 token
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
  });

  it('a client at the allowed rate is never dropped', () => {
    let now = 0;
    const bucket = new TokenBucket(70, 20, () => now);
    let dropped = 0;
    for (let i = 0; i < 700; i++) {
      now += 1000 / 70;
      if (!bucket.take()) dropped++;
    }
    expect(dropped).toBe(0);
  });

  it('never stores more than the burst', () => {
    let now = 0;
    const bucket = new TokenBucket(10, 3, () => now);
    now += 60_000;
    expect([1, 2, 3, 4].map(() => bucket.take())).toEqual([true, true, true, false]);
  });
});
