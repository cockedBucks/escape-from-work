import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

const draw = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.next());

describe('Rng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draw(new Rng(42), 20)).toEqual(draw(new Rng(42), 20));
  });

  it('gives different sequences for different seeds', () => {
    expect(draw(new Rng(1), 5)).not.toEqual(draw(new Rng(2), 5));
  });

  it('is pinned to known values (catches accidental algorithm changes)', () => {
    const rng = new Rng(12345);
    const values = draw(rng, 3).map((v) => Math.round(v * 1e9));
    expect(values).toEqual([979728268, 306752264, 484205422]);
  });

  it('continues the same sequence from a saved state', () => {
    const a = new Rng(7);
    draw(a, 10);
    const b = new Rng(a.state);
    expect(draw(b, 10)).toEqual(draw(a, 10));
  });

  it('stays inside its ranges', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 2000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const r = rng.range(-3, 5);
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThan(5);
      const n = rng.int(2, 4);
      expect([2, 3, 4]).toContain(n);
    }
  });

  it('int covers both ends', () => {
    const rng = new Rng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(rng.int(0, 3));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('pick returns an element and rejects empty arrays', () => {
    const rng = new Rng(3);
    expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
    expect(() => rng.pick([])).toThrow();
  });

  it('weighted roughly follows the weights and never picks weight 0', () => {
    const rng = new Rng(2024);
    const counts = [0, 0, 0];
    for (let i = 0; i < 10000; i++) counts[rng.weighted([1, 0, 3])]!++;
    expect(counts[1]).toBe(0);
    expect(counts[2]! / counts[0]!).toBeGreaterThan(2.6);
    expect(counts[2]! / counts[0]!).toBeLessThan(3.4);
  });

  it('weighted rejects bad weights', () => {
    const rng = new Rng(1);
    expect(() => rng.weighted([0, 0])).toThrow();
    expect(() => rng.weighted([1, -1])).toThrow();
    expect(() => rng.weighted([Number.NaN])).toThrow();
  });
});
