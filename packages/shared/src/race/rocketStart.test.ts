import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { createCar } from '../sim/car';
import { buildTrack } from '../track/build';
import { applyRocketStarts, rocketResult, trackCountdownGas, type RocketTracker } from './rocketStart';

const cfg = parseTuning(realTuning);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const ticks = (s: number): number => Math.round(s / cfg.sim.dt);
const GO = 1000;

describe('rocket start (P13.3)', () => {
  it('gas pressed just before GO = rocket; held since far too early = flooded; otherwise normal', () => {
    expect(rocketResult(GO - ticks(cfg.rocket.windowSeconds * 0.5), GO, cfg)).toBe('rocket');
    expect(rocketResult(GO, GO, cfg)).toBe('rocket'); // pressed on the GO tick itself
    expect(rocketResult(GO - ticks((cfg.rocket.windowSeconds + cfg.rocket.floodSeconds) / 2), GO, cfg)).toBe('normal');
    expect(rocketResult(GO - ticks(cfg.rocket.floodSeconds + 0.2), GO, cfg)).toBe('flooded');
    expect(rocketResult(null, GO, cfg)).toBe('normal'); // not on the gas at GO
  });

  it('the tracker remembers when the held gas went down, and a release forgets it', () => {
    const t: RocketTracker = new Map();
    trackCountdownGas(t, 'a', true, 10);
    trackCountdownGas(t, 'a', true, 11);
    expect(t.get('a')).toBe(10);
    trackCountdownGas(t, 'a', false, 12);
    trackCountdownGas(t, 'a', true, 13);
    expect(t.get('a')).toBe(13); // re-pressed: timed from the new press
  });

  it('at GO a rocket boosts, a flood stalls the engine, skilled bots always rocket', () => {
    const rocket = createCar('a', { speed: 1, grip: 1, weight: 1 }, track);
    const flood = createCar('b', { speed: 1, grip: 1, weight: 1 }, track);
    const bot = createCar('c', { speed: 1, grip: 1, weight: 1 }, track);
    const plain = createCar('d', { speed: 1, grip: 1, weight: 1 }, track);
    const t: RocketTracker = new Map([['a', GO - 5], ['b', GO - ticks(cfg.rocket.floodSeconds + 1)]]);
    const events = applyRocketStarts([rocket, flood, bot, plain], t, GO, cfg, new Map([['c', cfg.rocket.botSkill]]));
    expect(events).toEqual([{ type: 'rocketStart', car: 'a' }, { type: 'flooded', car: 'b' }, { type: 'rocketStart', car: 'c' }]);
    expect(rocket.boostTicks).toBe(ticks(cfg.rocket.boostSeconds));
    expect(flood.stallUntilTick).toBe(GO + ticks(cfg.rocket.floodStallSeconds));
    expect(plain.boostTicks).toBe(0);
    expect(plain.stallUntilTick).toBe(-1);
  });
});
