import { describe, expect, it } from 'vitest';
import { SnapshotBuffer, type CarSnap } from './snapshots';

const car = (x: number, yaw = 0, over: Partial<CarSnap> = {}): CarSnap => ({
  x, y: 0, z: 0, yaw, speed: x, steer: 0, respawning: false, ghost: false, stalled: false, drift: 0, driftLevel: 0, boosting: false, ...over,
});
const snap = (entries: [string, CarSnap][]): Map<string, CarSnap> => new Map(entries);

describe('SnapshotBuffer', () => {
  it('blends between the two snapshots around the render time', () => {
    const b = new SnapshotBuffer();
    b.push(0, snap([['a', car(0)]]));
    b.push(100, snap([['a', car(1)]]));
    b.push(200, snap([['a', car(3)]]));
    const out = new Map<string, CarSnap>();
    b.sample(50, out);
    expect(out.get('a')!.x).toBeCloseTo(0.5);
    b.sample(150, out);
    expect(out.get('a')!.x).toBeCloseTo(2);
  });

  it('holds the newest/oldest snapshot instead of guessing', () => {
    const b = new SnapshotBuffer();
    b.push(100, snap([['a', car(1)]]));
    b.push(200, snap([['a', car(2)]]));
    const out = new Map<string, CarSnap>();
    b.sample(500, out);
    expect(out.get('a')!.x).toBe(2);
    b.sample(0, out);
    expect(out.get('a')!.x).toBe(1);
  });

  it('turns the short way across ±PI', () => {
    const b = new SnapshotBuffer();
    b.push(0, snap([['a', car(0, 3)]]));
    b.push(100, snap([['a', car(0, -3)]]));
    const out = new Map<string, CarSnap>();
    b.sample(50, out);
    // Halfway along the short turn from 3 to -3 (through PI), not through 0.
    expect(Math.abs(Math.cos(out.get('a')!.yaw) - Math.cos(Math.PI))).toBeLessThan(0.01);
  });

  it('adds new cars, removes departed ones and reuses objects', () => {
    const b = new SnapshotBuffer();
    b.push(0, snap([['a', car(0)], ['b', car(0)]]));
    b.push(100, snap([['a', car(10)], ['c', car(5)]]));
    const out = new Map<string, CarSnap>();
    b.sample(0, out);
    const objA = out.get('a');
    b.sample(100, out);
    expect([...out.keys()].sort()).toEqual(['a', 'c']);
    expect(out.get('a')).toBe(objA);
    expect(out.get('c')!.x).toBe(5);
  });

  it('ignores snapshots that arrive out of order', () => {
    const b = new SnapshotBuffer();
    b.push(100, snap([['a', car(1)]]));
    b.push(50, snap([['a', car(99)]]));
    expect(b.size).toBe(1);
  });
});

describe('SnapshotBuffer teleports', () => {
  it('does not slide a respawned car across the map', () => {
    const b = new SnapshotBuffer();
    b.push(0, snap([['a', car(0)]]));
    b.push(100, snap([['a', car(200)]]));
    const out = new Map<string, CarSnap>();
    b.sample(50, out);
    expect(out.get('a')!.x).toBe(200);
  });
});
