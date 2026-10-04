/**
 * Seeded random numbers (mulberry32). The sim must never use `Math.random`: with the same
 * seed, every machine draws the same numbers in the same order, so replays and tests match.
 *
 * The whole generator is one 32-bit number (`state`), so it can be saved in a snapshot,
 * hashed, and restored.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** The current internal state. Pass it to `new Rng(state)` to continue the same sequence. */
  get state(): number {
    return this.s;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] (both inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** One element of a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  /**
   * Index chosen with probability proportional to its weight (used for item rolls).
   * Weights must be >= 0 with a positive sum.
   */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!(w >= 0)) throw new Error('Rng.weighted: weights must be >= 0');
      total += w;
    }
    if (!(total > 0)) throw new Error('Rng.weighted: weights must have a positive sum');
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i] as number;
      if (r < 0) return i;
    }
    // Float rounding can leave r at ~0: return the last index with weight.
    for (let i = weights.length - 1; i >= 0; i--) if ((weights[i] as number) > 0) return i;
    return 0;
  }
}
