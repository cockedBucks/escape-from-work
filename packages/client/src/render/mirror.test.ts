import { describe, expect, it } from 'vitest';
import { mirrorDue } from './mirror';

describe('mirror schedule', () => {
  it('off on Low, every 2nd frame on Medium, every frame on High', () => {
    const frames = [1, 2, 3, 4, 5, 6];
    expect(frames.map((f) => mirrorDue('off', f))).toEqual([false, false, false, false, false, false]);
    expect(frames.map((f) => mirrorDue('half', f)).filter(Boolean).length).toBe(3);
    expect(frames.map((f) => mirrorDue('full', f)).every(Boolean)).toBe(true);
  });
});
