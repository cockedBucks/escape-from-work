import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { buildTrack } from '../track/build';
import { forward, right } from '../util/math';
import { createCar } from './car';
import { inWake, stepSlipstream } from './slipstream';
import type { CarState, SimEvent } from './types';

const cfg = parseTuning(realTuning);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const s = cfg.slipstream;
const ticks = (sec: number): number => Math.round(sec / cfg.sim.dt);

/** Two cars on the start straight at speed: `b` placed `ahead` m in front and `side` m to the right of `a`. */
function pair(ahead: number, side = 0): [CarState, CarState] {
  const a = createCar('a', { speed: 1, grip: 1, weight: 1 }, track);
  const b = createCar('b', { speed: 1, grip: 1, weight: 1 }, track);
  const f = forward(a.yaw);
  const r = right(a.yaw);
  b.x = a.x + f.x * ahead + r.x * side;
  b.z = a.z + f.z * ahead + r.z * side;
  b.yaw = a.yaw;
  for (const c of [a, b]) {
    c.vx = f.x * cfg.car.topSpeed * 0.8;
    c.vz = f.z * cfg.car.topSpeed * 0.8;
  }
  return [a, b];
}

function run(cars: CarState[], n: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) stepSlipstream(cars, cfg, 100 + i, events);
  return events;
}

describe('slipstream (P13.4)', () => {
  it('right behind a rival: in the wake; beside it, too far or crossing: not', () => {
    expect(inWake(...pair(s.range * 0.5), cfg)).toBe(true);
    expect(inWake(...pair(s.range * 0.5, s.width * 2), cfg)).toBe(false);
    expect(inWake(...pair(s.range * 1.5), cfg)).toBe(false);
    const [a, b] = pair(s.range * 0.5);
    expect(inWake(b, a, cfg)).toBe(false); // the leader is not behind anyone
    b.yaw += Math.PI / 2;
    expect(inWake(a, b, cfg)).toBe(false);
  });

  it('charges in the wake, boosts once, then cools down before charging again', () => {
    const [a, b] = pair(6);
    const events = run([a, b], ticks(s.chargeSeconds) + 1);
    expect(events).toEqual([{ type: 'slipstream', car: 'a' }]);
    expect(a.boostTicks).toBe(ticks(s.boostSeconds));
    expect(b.boostTicks).toBe(0);
    expect(run([a, b], ticks(s.cooldownSeconds) - 2)).toEqual([]); // still in the wake, but cooling down
    expect(run([a, b], ticks(s.chargeSeconds) + 4)).toEqual([{ type: 'slipstream', car: 'a' }]);
  });

  it('the charge drains out of the wake, and slow cars do not draft', () => {
    const [a, b] = pair(6);
    run([a, b], ticks(s.chargeSeconds * 0.5));
    const charged = a.slipCharge;
    b.x += 100;
    run([a, b], 10);
    expect(a.slipCharge).toBeLessThan(charged);
    const [c, d] = pair(6);
    c.vx *= 0.1;
    c.vz *= 0.1;
    run([c, d], ticks(s.chargeSeconds) + 1);
    expect(c.slipCharge).toBe(0);
  });

  it('a car fading to a respawn or ghosted gives no wake', () => {
    const [a, b] = pair(6);
    b.ghostUntilTick = 10_000;
    expect(run([a, b], ticks(s.chargeSeconds) + 1)).toEqual([]);
  });
});
