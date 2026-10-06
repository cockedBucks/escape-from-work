import { describe, expect, it } from 'vitest';
import { speedLineStrength } from './speedLines';

describe('speed lines', () => {
  it('none at normal speeds, growing past three quarters of top speed', () => {
    expect(speedLineStrength(0.5, false)).toBe(0);
    expect(speedLineStrength(1, false)).toBeGreaterThan(0.25);
    expect(speedLineStrength(1, false)).toBeLessThan(0.5);
    expect(speedLineStrength(1.4, false)).toBe(1);
  });

  it('a boost or nitro adds streaks even before top speed', () => {
    expect(speedLineStrength(0.7, true)).toBeGreaterThan(0.4);
    expect(speedLineStrength(2, true)).toBe(1);
  });
});
