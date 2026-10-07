import type { SectorGate } from '@escape/shared';
import { describe, expect, it } from 'vitest';
import type { CarSnap } from '../net/snapshots';
import { ReplayRecorder, crossingTime, photoFinishPair, replayWindow, sampleClip } from './photoFinish';

const snap = (x: number, z: number): CarSnap => ({
  x, y: 0, z, yaw: 0, speed: 20, steer: 0, respawning: false, ghost: false, stalled: false,
  drift: 0, driftLevel: 0, boosting: false, nitroOn: false, shielded: false,
});

/** Finish line across the road at z = 0, cars drive toward +z. */
const gate: SectorGate = { index: 0, progress: 0, sample: 0, pos: { x: 0, z: 0 }, yaw: 0, left: { x: -6, z: 0 }, right: { x: 6, z: 0 } };

/** car0 at 20 m/s and car1 at 19 m/s, both reaching z = 0 around t = 1000 ms. */
function race(rec: ReplayRecorder, ms: number): void {
  for (let t = 0; t <= ms; t += 1000 / 60) {
    rec.record(t, new Map([
      ['car0', snap(-2, -20 + (t / 1000) * 20)],
      ['car1', snap(2, -19.5 + (t / 1000) * 19)],
    ]));
  }
}

describe('photo finish (P11.2)', () => {
  it('finds when each car crossed the line', () => {
    const rec = new ReplayRecorder(8, 30, 4);
    race(rec, 2000);
    const clip = rec.clip();
    expect(crossingTime(clip, 0, gate)).toBeCloseTo(1000, -1);
    expect(crossingTime(clip, 1, gate)).toBeCloseTo((19.5 / 19) * 1000, -1);
    expect(crossingTime(clip, 5, gate)).toBeNull(); // not in the race
  });

  it('keeps only the last seconds', () => {
    const rec = new ReplayRecorder(8, 30, 1);
    race(rec, 3000);
    const clip = rec.clip();
    expect(clip.times[0]!).toBeGreaterThan(1900);
    expect(clip.times.length).toBeLessThanOrEqual(31);
  });

  it('plays the clip back between frames', () => {
    const rec = new ReplayRecorder(8, 30, 4);
    race(rec, 2000);
    const out = new Map<string, CarSnap>();
    sampleClip(rec.clip(), 500, out);
    expect(out.get('car0')!.z).toBeCloseTo(-10, 0);
    expect(out.get('car1')!.x).toBe(2);
  });

  it('a crossing off the road (the line extended) does not count', () => {
    const rec = new ReplayRecorder(8, 30, 4);
    for (let t = 0; t <= 2000; t += 1000 / 30) rec.record(t, new Map([['car0', snap(40, -20 + (t / 1000) * 20)]]));
    expect(crossingTime(rec.clip(), 0, gate)).toBeNull();
  });

  it('a photo finish is 1st and 2nd close together', () => {
    const cars = [
      { slot: 0, finished: true, finishMs: 120_400 },
      { slot: 3, finished: true, finishMs: 120_150 },
      { slot: 2, finished: false, finishMs: 0 },
    ];
    expect(photoFinishPair(cars, 500)).toEqual({ winner: 3, runnerUp: 0, gapMs: 250 });
    expect(photoFinishPair(cars, 200)).toBeNull();
    expect(photoFinishPair(cars.slice(0, 1), 500)).toBeNull();
  });

  it('the replay runs around both crossings, inside the clip', () => {
    const rec = new ReplayRecorder(8, 30, 4);
    race(rec, 2000);
    const clip = rec.clip();
    expect(replayWindow(clip, 1000, 1030, 1.2, 0.8)).toEqual({ from: 0, to: 1830 });
    const all = replayWindow(clip, null, 1030, 1.2, 0.8);
    expect(all.from).toBe(clip.times[0]);
  });
});
