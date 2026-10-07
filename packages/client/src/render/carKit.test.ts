import { BODY_PRESETS, CAR_PARTS } from '@escape/shared';
import { describe, expect, it } from 'vitest';
import { loadCars, loadTuning } from '../content';
import { archRadius, buildCarShape, buildWheel, triangles } from './carKit';
import { CAR_BODIES, CAR_KIT, CAR_PARTS_LOOK, HEAD } from './look';
import { clipZ, heightAt, insetConvex, signedArea2 } from './sideProfile';

const budget = loadTuning().quality.carMaxTriangles;
const roster = loadCars().cars;
/** Four wheels + roof number + shadow, as the car mesh draws them. */
function extraTris(wheelRadius: number): number {
  const wheel = buildWheel(wheelRadius);
  const tris = triangles(wheel);
  wheel.dispose();
  return 4 * tris + 2 + 20;
}

describe('car kit (real-life car types, P12.2)', () => {
  it('every roster car stays inside the per-car triangle budget', () => {
    for (const car of roster) {
      const shape = buildCarShape(car.look, 0xe63946);
      expect(triangles(shape.body) + extraTris(shape.wheelRadius), car.id).toBeLessThanOrEqual(budget);
      expect(shape.body.getAttribute('color')).toBeDefined();
      shape.body.dispose();
    }
  });

  it('every body type builds with every part (no crash, no NaN) and stays near budget', () => {
    for (const body of BODY_PRESETS) {
      const shape = buildCarShape({ body, wheelScale: 1.2, parts: [...CAR_PARTS] }, 0xe63946);
      const pos = shape.body.getAttribute('position');
      for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite(pos.array[i]), body).toBe(true);
      expect(triangles(shape.body) + extraTris(shape.wheelRadius), body).toBeLessThanOrEqual(budget * 1.25);
      shape.body.dispose();
    }
  });

  it('roster wheels clear their arches and the body keeps some metal above them', () => {
    for (const car of roster) {
      const B = CAR_BODIES[car.look.body];
      const r = CAR_KIT.wheelRadius * car.look.wheelScale;
      for (const z of [B.wheelBase, -B.wheelBase]) {
        expect(archRadius(B.outline, z, r), car.id).toBeGreaterThan(r);
        // The arch fits inside the body's length.
        const front = B.outline[0]![0];
        const back = B.outline[B.outline.length - 1]![0];
        expect(z + archRadius(B.outline, z, r), car.id).toBeLessThan(front);
        expect(z - archRadius(B.outline, z, r), car.id).toBeGreaterThan(back);
      }
    }
  });

  it('cabins sit on their bodies, wind counter-clockwise, and every side window has glass', () => {
    for (const body of BODY_PRESETS) {
      const B = CAR_BODIES[body];
      expect(signedArea2(B.cabin), body).toBeGreaterThan(0);
      // The cabin's bottom corners are tucked into the body.
      for (const p of [B.cabin[0]!, B.cabin[B.cabin.length - 1]!]) expect(p[1], body).toBeLessThanOrEqual(heightAt(B.outline, p[0], false) + 1e-9);
      const glass = insetConvex(B.cabin, CAR_PARTS_LOOK.pillar);
      for (const [z0, z1] of B.windows) expect(clipZ(glass, Math.min(z0, z1), Math.max(z0, z1)).length, `${body} ${z0}`).toBeGreaterThanOrEqual(3);
      expect(B.cabinWidth * B.width, body).toBeLessThanOrEqual(B.width);
    }
  });

  it('heads poke out of the roof inside the cabin; the number sits on the roof or the hood', () => {
    for (const body of BODY_PRESETS) {
      const B = CAR_BODIES[body];
      const plain = buildCarShape({ body, wheelScale: 1, parts: [] }, 0);
      const roof = heightAt(B.cabin, plain.seatZ);
      expect(plain.headY).toBeGreaterThan(roof);
      expect(plain.headY - HEAD.radius).toBeLessThan(roof);
      expect(plain.seatZ).toBeLessThan(B.cabin[1]![0]); // behind the windshield top
      expect(plain.seatZ).toBeGreaterThan(B.cabin[B.cabin.length - 2]![0]); // ahead of the roof's back
      expect(plain.numberY).toBeGreaterThan(heightAt(B.outline, plain.numberZ, false));
      // A roof part always moves the number to the hood (ahead of the windshield).
      const taxi = buildCarShape({ body, wheelScale: 1, parts: ['roofSign'] }, 0);
      expect(taxi.numberZ, body).toBeGreaterThan(B.cabin[0]![0]);
      plain.body.dispose();
      taxi.body.dispose();
    }
  });

  it('bigger wheelScale = bigger wheels; wheels sit flush with the body sides', () => {
    const small = buildCarShape({ body: 'city', wheelScale: 1, parts: [] }, 0);
    const big = buildCarShape({ body: 'city', wheelScale: 1.15, parts: [] }, 0);
    expect(big.wheelRadius).toBeCloseTo(small.wheelRadius * 1.15, 6);
    expect(small.wheelTrack + small.wheelWidth / 2).toBeCloseTo(small.width / 2, 6);
    small.body.dispose();
    big.body.dispose();
  });

  it('a wheel is a tire plus a rim, vertex-colored', () => {
    const w = buildWheel(0.4);
    expect(w.getAttribute('color')).toBeDefined();
    w.computeBoundingBox();
    expect(w.boundingBox!.max.y).toBeLessThanOrEqual(0.4);
    expect(w.boundingBox!.max.y).toBeGreaterThan(0.38);
    expect(w.boundingBox!.max.x).toBeGreaterThan(CAR_KIT.wheelWidth / 2); // the rim shows on both faces
    w.dispose();
  });
});

describe('car types (P12.2)', () => {
  it('every body type has a real-life type name in both languages', async () => {
    const { carLabel, carType } = await import('../ui/carType');
    const { setLang } = await import('../i18n');
    for (const body of BODY_PRESETS) {
      setLang('en');
      const en = carType(body);
      setLang('ar');
      const ar = carType(body);
      expect(en.length, body).toBeGreaterThan(1);
      expect(ar).not.toBe(en);
    }
    setLang('en');
    expect(carLabel({ name: 'Cabbie', look: { body: 'sedan', wheelScale: 1, parts: [] } })).toBe('Cabbie · Sedan');
  });
});
