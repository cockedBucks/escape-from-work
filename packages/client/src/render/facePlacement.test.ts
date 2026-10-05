import { describe, expect, it } from 'vitest';
import { photoPlacement } from './facePlacement';
import { HEAD } from './look';

const oval = { cx: 128, cy: 128, rx: 56, ry: 102 };
const eyeLine = oval.cy + HEAD.ovalEyes * oval.ry;
const chinLine = oval.cy + HEAD.ovalChin * oval.ry;

describe('photoPlacement', () => {
  it('puts the eyes of differently framed photos on the same line', () => {
    // A tight portrait selfie, a square photo with the face high up, a wide one off to the side.
    for (const [w, h, eyes, chin, x] of [[576, 800, 0.465, 0.95, 0.5], [736, 736, 0.36, 0.845, 0.5], [1200, 800, 0.2, 0.5, 0.3]] as const) {
      const p = photoPlacement(w, h, oval, { eyes, chin, x });
      expect(p.y + eyes * p.h).toBeCloseTo(eyeLine, 6);
      expect(p.x + x * p.w).toBeCloseTo(oval.cx, 6);
    }
  });

  it('with room around the face, the chin lands on the chin line too', () => {
    const p = photoPlacement(1000, 1000, oval, { eyes: 0.45, chin: 0.6 });
    expect(p.y + 0.45 * p.h).toBeCloseTo(eyeLine, 6);
    expect(p.y + 0.6 * p.h).toBeCloseTo(chinLine, 6);
  });

  it('always covers the whole oval', () => {
    for (const framing of [{}, { eyes: 0.05, chin: 0.95 }, { eyes: 0.8, chin: 0.85, x: 0 }, { eyes: 0.1, chin: 0.2, x: 1 }]) {
      for (const [w, h] of [[576, 800], [800, 400], [300, 300]] as const) {
        const p = photoPlacement(w, h, oval, framing);
        expect(p.x).toBeLessThanOrEqual(oval.cx - oval.rx + 1e-6);
        expect(p.y).toBeLessThanOrEqual(oval.cy - oval.ry + 1e-6);
        expect(p.x + p.w).toBeGreaterThanOrEqual(oval.cx + oval.rx - 1e-6);
        expect(p.y + p.h).toBeGreaterThanOrEqual(oval.cy + oval.ry - 1e-6);
      }
    }
  });

  it('a photo without framing is treated as a typical portrait, centered', () => {
    const p = photoPlacement(600, 800, oval);
    expect(p.x + p.w / 2).toBeCloseTo(oval.cx, 6);
    expect(p.y + HEAD.photoEyes * p.h).toBeCloseTo(eyeLine, 0);
  });
});
