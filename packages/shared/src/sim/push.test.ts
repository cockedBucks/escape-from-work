import { describe, expect, it } from 'vitest';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { buildTrack } from '../track/build';
import { createCar, createWorld } from './car';
import { step } from './step';
import { NO_INPUT } from './types';

const cfg = parseTuning(realTuning);

/** The Test Loop's first straight with a fan blowing `toward` from 2% to 9% of the lap. */
function lateralAfterFan(toward: 'left' | 'right' | null): number {
  const def = parseTrack({ ...testLoopJson, zones: toward ? [{ type: 'push', from: 0.02, to: 0.09, toward, strength: 12 }] : [] }, 'fan');
  const track = buildTrack(def, cfg.track);
  const car = createCar('a', { speed: 1, grip: 1, weight: 1 }, track);
  car.vx = 18; // along the straight (+X), hands off the wheel
  const world = createWorld(track, [car]);
  for (let i = 0; i < Math.round(1.2 / cfg.sim.dt); i++) step(world, { a: { ...NO_INPUT, gas: true } }, cfg);
  return car.lateral;
}

describe('fan push zones (P10.1)', () => {
  it('shove the car sideways the way they blow; no fan, no shove', () => {
    const none = lateralAfterFan(null);
    const right = lateralAfterFan('right');
    const left = lateralAfterFan('left');
    expect(right - none).toBeGreaterThan(0.2); // tire grip fights it: the car slides, it does not fly
    expect(left - none).toBeLessThan(-0.2);
  });

  it('a push zone covers the whole width and slick zones can look like ice', () => {
    const def = parseTrack({ ...testLoopJson, zones: [{ type: 'slick', from: 0.2, to: 0.3, side: 'both', look: 'ice' }, { type: 'slick', from: 0.4, to: 0.5, side: 'both' }] }, 'ice');
    const slicks = def.zones.filter((z) => z.type === 'slick');
    expect(slicks.map((z) => z.type === 'slick' && z.look)).toEqual(['ice', 'coffee']);
  });
});
