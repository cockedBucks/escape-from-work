import { describe, expect, it } from 'vitest';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { buildTrack } from '../track/build';
import { dot, forward } from '../util/math';
import { carStateFromView, type CarViewLike } from './fromView';

const cfg = parseTuning(realTuning);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const STATS = { speed: 1, grip: 1, weight: 1 };

const view = (over: Partial<CarViewLike>): CarViewLike => ({
  x: 10, z: 0, y: 0, yaw: Math.PI / 2, speed: 0, vx: 0, vz: 0, respawning: false, heat: 0, stallLeft: 0,
  steer: 0, drift: 0, nitro: 0, item: '', spinLeft: 0, updateLeft: 0, swapLeft: 0, lagLeft: 0, ...over,
});

describe('carStateFromView (network bots)', () => {
  it('keeps the real velocity, so a bot knows when it is rolling backward', () => {
    // Facing +X (yaw π/2) but moving toward -X: reversing at 5 m/s.
    const car = carStateFromView('a', view({ speed: 5, vx: -5, vz: 0 }), track, STATS);
    expect(dot({ x: car.vx, z: car.vz }, forward(car.yaw))).toBeCloseTo(-5);
  });

  it('finds the car on the track', () => {
    const car = carStateFromView('a', view({}), track, STATS);
    expect(car.segment).toBeGreaterThanOrEqual(0);
    expect(car.progress).toBeLessThan(0.05);
  });
});
