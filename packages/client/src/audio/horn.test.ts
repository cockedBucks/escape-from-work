import { describe, expect, it } from 'vitest';
import { HORNS } from '@escape/shared';
import { HORN_PRESETS, hornVolume } from './horn';

describe('horns', () => {
  it('every horn named in the config schema has a sound', () => {
    for (const h of HORNS) {
      const p = HORN_PRESETS[h];
      expect(p.voices.length).toBeGreaterThan(0);
      expect(p.duration).toBeGreaterThan(0.1); // long enough for attack + release
      expect(p.gain).toBeGreaterThan(0);
      expect(p.gain).toBeLessThanOrEqual(0.5); // never deafening
    }
  });

  it('gets quieter with distance', () => {
    expect(hornVolume(0)).toBe(1);
    expect(hornVolume(40)).toBeCloseTo(0.5);
    expect(hornVolume(200)).toBeLessThan(0.2);
  });
});
