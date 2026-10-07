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
  car.onPad = false; // driving in from before the pad
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

  it('respawning on a gate that sits on a pad gives no free boost', () => {
    const gate = track.gates.find((g) => {
      const p = track.samples[g.sample]!.progress;
      return track.rangedZones.some((z) => z.type === 'boost' && p >= z.from && p < z.to);
    });
    expect(gate).toBeDefined(); // office: gate 1 is on the first pad
    const car = createCar('a', { speed: 1, grip: 1, weight: 1 }, track, gate!.index);
    const world = createWorld(track, [car]);
    expect(step(world, { a: { ...NO_INPUT, gas: true } }, cfg).some((e) => e.type === 'boostPad')).toBe(false);
  });

  it('a stalled or spun-out car rolling onto a pad gets nothing', () => {
    const stalled = atPad();
    stalled.cars[0]!.stallUntilTick = 1000;
    expect(step(stalled, { a: NO_INPUT }, cfg).some((e) => e.type === 'boostPad')).toBe(false);
    const spun = atPad();
    spun.cars[0]!.spinTicks = 30;
    expect(step(spun, { a: NO_INPUT }, cfg).some((e) => e.type === 'boostPad')).toBe(false);
  });

  it('flying over a pad does nothing', () => {
    const world = atPad();
    world.cars[0]!.y = 2;
    expect(step(world, { a: NO_INPUT }, cfg).some((e) => e.type === 'boostPad')).toBe(false);
  });
});
