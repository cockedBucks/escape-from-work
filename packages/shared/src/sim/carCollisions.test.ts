import { describe, expect, it } from 'vitest';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { gridSpot } from '../race/grid';
import { buildTrack } from '../track/build';
import { locateOnTrack } from '../track/locate';
import { createCar, createCarOnGrid } from './car';
import { collideCars } from './carCollisions';
import type { CarState, SimEvent } from './types';

const cfg = parseTuning(realTuning);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const r = cfg.car.radius;

/** Two cars on the straight, `gap` meters apart along X, driving at each other. */
function headOn(gap: number, speed: number, weightA = 1, weightB = 1): [CarState, CarState] {
  const a = createCar('a', { speed: 1, grip: 1, weight: weightA }, track);
  const b = createCar('b', { speed: 1, grip: 1, weight: weightB }, track);
  a.x = 50;
  b.x = 50 + gap;
  a.vx = speed;
  b.vx = -speed;
  return [a, b];
}

describe('car-to-car bumps', () => {
  it('pushes overlapping cars apart and bounces them', () => {
    const [a, b] = headOn(r, 10);
    const events: SimEvent[] = [];
    collideCars([a, b], 1, cfg.car, events);
    expect(b.x - a.x).toBeCloseTo(2 * r, 6);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
    expect(events).toEqual([{ type: 'carHit', car: 'a', other: 'b', speed: 20 }]);
  });

  it('a heavier car is pushed less and keeps more of its speed', () => {
    const [a, b] = headOn(r, 10, 1.08, 0.92);
    const ax = a.x;
    const bx = b.x;
    collideCars([a, b], 1, cfg.car, []);
    expect(Math.abs(a.x - ax)).toBeLessThan(Math.abs(b.x - bx));
    expect(Math.abs(a.vx)).toBeLessThan(Math.abs(b.vx));
  });

  it('keeps momentum (equal and opposite impulses)', () => {
    const [a, b] = headOn(r, 10, 1.08, 0.92);
    const before = a.vx * 1.08 + b.vx * 0.92;
    collideCars([a, b], 1, cfg.car, []);
    expect(a.vx * 1.08 + b.vx * 0.92).toBeCloseTo(before, 9);
  });

  it('cars already moving apart are separated but not bounced again', () => {
    const [a, b] = headOn(r, -5);
    collideCars([a, b], 1, cfg.car, []);
    expect(a.vx).toBe(-5);
    expect(b.vx).toBe(5);
  });

  it('a gentle nudge is not a bump event', () => {
    const [a, b] = headOn(r, 1);
    const events: SimEvent[] = [];
    collideCars([a, b], 1, cfg.car, events);
    expect(events).toEqual([]);
  });

  it('ghosted, respawning and airborne cars pass through', () => {
    for (const setup of [(c: CarState) => (c.ghostUntilTick = 10), (c: CarState) => (c.respawnAtTick = 5), (c: CarState) => (c.y = 1)]) {
      const [a, b] = headOn(r, 10);
      setup(a);
      const bx = b.x;
      collideCars([a, b], 1, cfg.car, []);
      expect(b.x).toBe(bx);
    }
  });
});

describe('starting grid', () => {
  it('places 8 cars behind the line, two by two, on the road, not overlapping', () => {
    const spots = Array.from({ length: 8 }, (_, i) => gridSpot(track, i, cfg.race));
    for (const s of spots) {
      const loc = locateOnTrack(track, s.pos);
      expect(loc.onTrack).toBe(true);
      expect(Math.abs(loc.lateral)).toBeLessThan(loc.halfWidth - r);
      expect(loc.progress).toBeGreaterThan(0.5); // behind the start line (progress wraps to ~1)
    }
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const d = Math.hypot(spots[i]!.pos.x - spots[j]!.pos.x, spots[i]!.pos.z - spots[j]!.pos.z);
        expect(d).toBeGreaterThan(2 * r);
      }
    }
    // Pole is the left car of the first row; the next row is further back.
    expect(spots[0]!.pos.x).toBeGreaterThan(spots[2]!.pos.x);
  });

  it('createCarOnGrid puts a stopped car on its spot', () => {
    const car = createCarOnGrid('car3', { speed: 1, grip: 1, weight: 1 }, track, 3, cfg.race);
    const spot = gridSpot(track, 3, cfg.race);
    expect(car.x).toBeCloseTo(spot.pos.x);
    expect(car.z).toBeCloseTo(spot.pos.z);
    expect(car.yaw).toBeCloseTo(spot.yaw);
    expect(car.vx).toBe(0);
    expect(car.lastGate).toBe(0);
  });
});
