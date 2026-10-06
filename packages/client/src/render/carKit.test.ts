import { BODY_PRESETS, CAR_PARTS } from '@escape/shared';
import { describe, expect, it } from 'vitest';
import { loadTuning } from '../content';
import { buildCarShape, triangles } from './carKit';
import { CAR_BODIES, CAR_KIT } from './look';

const budget = loadTuning().quality.carMaxTriangles;
/** Body + four wheels + roof number + shadow, as the car mesh draws them. */
const wheelTris = 4 * (CAR_KIT.wheelSegments * 4);
const extraTris = wheelTris + 2 + 20;

describe('car kit', () => {
  it('every body preset, even with every part, stays inside the per-car triangle budget', () => {
    for (const body of BODY_PRESETS) {
      const shape = buildCarShape({ body, wheelScale: 1.4, parts: [...CAR_PARTS] }, 0xe63946);
      expect(triangles(shape.body) + extraTris).toBeLessThanOrEqual(budget);
      expect(shape.body.getAttribute('color')).toBeDefined();
      shape.body.dispose();
    }
  });

  it('heads sit on the roof, in the front half of the cabin; the roof number moves to the hood when a roof part is there', () => {
    for (const body of BODY_PRESETS) {
      const B = CAR_BODIES[body];
      const plain = buildCarShape({ body, wheelScale: 1, parts: [] }, 0);
      expect(plain.headY).toBeGreaterThan(B.ride + B.body + B.cabinHeight);
      expect(plain.seatZ).toBeGreaterThan(B.cabinZ);
      expect(plain.seatZ).toBeLessThan(B.cabinZ + B.cabinLength / 2);
      expect(plain.numberY).toBeGreaterThan(B.ride + B.body + B.cabinHeight); // on the roof
      const taxi = buildCarShape({ body, wheelScale: 1, parts: ['roofSign'] }, 0);
      expect(taxi.numberY).toBeLessThan(B.ride + B.body + B.cabinHeight); // on the hood
      expect(taxi.numberZ).toBeGreaterThan(B.cabinZ);
    }
  });

  it('bigger wheelScale = bigger wheels', () => {
    const small = buildCarShape({ body: 'mini', wheelScale: 1, parts: [] }, 0);
    const big = buildCarShape({ body: 'mini', wheelScale: 1.4, parts: [] }, 0);
    expect(big.wheelRadius).toBeCloseTo(small.wheelRadius * 1.4, 6);
  });
});
