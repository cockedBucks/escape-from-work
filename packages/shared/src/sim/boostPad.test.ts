import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import officeJson from '../../../../config/tracks/office.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { buildTrack } from '../track/build';
import { createCar, createWorld } from './car';
import { step } from './step';
import { NO_INPUT } from './types';

const cfg = parseTuning(realTuning);
const track = buildTrack(parseTrack(officeJson, 'office'), cfg.track);
const pad = track.rangedZones.find((z) => z.type === 'boost' && z.side === 'both')!;

/** A car on the centerline at the pad's start, moving along the road. */
function atPad() {
  const i = track.samples.findIndex((s) => s.progress >= pad.from + 0.001);
  const s = track.samples[i]!;
  const car = createCar('a', { speed: 1, grip: 1, weight: 1 }, track);
  car.x = s.pos.x;
  car.z = s.pos.z;
  car.yaw = Math.atan2(s.dir.x, s.dir.z);
  car.vx = s.dir.x * 20;
  car.vz = s.dir.z * 20;
  car.segment = i;
  return createWorld(track, [car]);
}

describe('boost pads (P13.6)', () => {
  it('driving onto a pad boosts once (on entry), not every tick on it', () => {
    const world = atPad();
    const first = step(world, { a: { ...NO_INPUT, gas: true } }, cfg);
    expect(first).toContainEqual({ type: 'boostPad', car: 'a' });
    expect(world.cars[0]!.boostTicks).toBe(Math.round(cfg.boostPad.boostSeconds / cfg.sim.dt));
    const second = step(world, { a: { ...NO_INPUT, gas: true } }, cfg);
    expect(second.some((e) => e.type === 'boostPad')).toBe(false);
  });

  it('flying over a pad does nothing', () => {
    const world = atPad();
    world.cars[0]!.y = 2;
    expect(step(world, { a: NO_INPUT }, cfg).some((e) => e.type === 'boostPad')).toBe(false);
  });
});
