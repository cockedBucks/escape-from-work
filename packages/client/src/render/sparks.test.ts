import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CarSnap } from '../net/snapshots';
import { SPARKS } from './look';
import { Sparks } from './sparks';

const snap = (over: Partial<CarSnap>): CarSnap => ({
  x: 0, y: 0, z: 0, yaw: 0, speed: 20, steer: 0, respawning: false, ghost: false, stalled: false,
  drift: 0, driftLevel: 0, boosting: false, nitroOn: false, ...over,
});

const colorOf = (s: Sparks, i: number): number => {
  const c = new THREE.Color();
  s.mesh.getColorAt(i, c);
  return c.getHex();
};

describe('sparks', () => {
  it('nothing for a car driving normally', () => {
    const s = new Sparks('normal');
    s.update(0, 0.016, new Map([['a', snap({})]]));
    expect(s.mesh.count).toBe(0);
    s.dispose();
  });

  it('a drifting car throws dust from both rear wheels, then its level color', () => {
    const s = new Sparks('normal');
    s.update(0, 0.001, new Map([['a', snap({ drift: 1 })]]));
    expect(s.mesh.count).toBe(2);
    expect(colorOf(s, 0)).toBe(new THREE.Color(SPARKS.dust).getHex());
    s.update(SPARKS.driftEveryMs, 0.001, new Map([['a', snap({ drift: 1, driftLevel: 3 })]]));
    expect(colorOf(s, 2)).toBe(new THREE.Color(SPARKS.levels[2]).getHex());
    s.dispose();
  });

  it('boosting cars flame; particles die after their life', () => {
    const s = new Sparks('normal');
    const cars = new Map([['a', snap({ boosting: true })]]);
    s.update(0, 0.001, cars);
    expect(s.mesh.count).toBe(1);
    cars.set('a', snap({}));
    s.update(1000, SPARKS.dustLife + 0.1, cars);
    s.update(1001, 0.001, cars);
    expect(s.mesh.count).toBe(0);
    s.dispose();
  });
});
