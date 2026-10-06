import { describe, expect, it } from 'vitest';
import { updateProgress } from './itemEffects';

describe('Forced Update progress', () => {
  it('fills from 0 to 1 as the time left runs out', () => {
    expect(updateProgress(2.5, 2.5)).toBe(0);
    expect(updateProgress(1.25, 2.5)).toBeCloseTo(0.5, 6);
    expect(updateProgress(0, 2.5)).toBe(1);
    expect(updateProgress(-1, 2.5)).toBe(1);
  });
});
