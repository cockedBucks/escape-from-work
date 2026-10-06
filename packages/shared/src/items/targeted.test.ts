import { describe, expect, it } from 'vitest';
import realItems from '../../../../config/items.json';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { parseItems } from '../config/items';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { createCar, createWorld } from '../sim/car';
import { step } from '../sim/step';
import { NO_INPUT, type CarInput, type CarState, type SimEvent, type World } from '../sim/types';
import { buildTrack } from '../track/build';
import { createChaos } from './chaos';
import { applyControlEffects, swapControls } from './controlEffects';
import { carAhead, leader, randomAhead } from './targeted';

const cfg = parseTuning(realTuning);
const items = parseItems(realItems);
const dt = cfg.sim.dt;
const secs = (s: number): number => Math.round(s / dt);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const FIRE: CarInput = { ...NO_INPUT, fire: true };

/** Cars at given lap progress (and laps), front to back is decided by that. */
function world(...cars: [string, number][]): World {
  const w = createWorld(
    track,
    cars.map(([id, progress]) => {
      const c = createCar(id, { speed: 1, grip: 1, weight: 1 }, track);
      c.progress = progress;
      c.lastGate = 1;
      return c;
    }),
  );
  w.chaos = createChaos(track, items, 3);
  w.chaos.boxes = [];
  return w;
}
const car = (w: World, id: string): CarState => w.cars.find((c) => c.id === id)!;
const use = (w: World, id: string, item: string): SimEvent[] => {
  car(w, id).item = item;
  return step(w, { [id]: FIRE }, cfg);
};

describe('who an item targets', () => {
  it('the car directly ahead, the leader (never yourself), a random car ahead from the top', () => {
    const w = world(['a', 0.9], ['b', 0.7], ['c', 0.5], ['d', 0.3], ['e', 0.1]);
    expect(carAhead(w, car(w, 'c'), 1)?.id).toBe('b');
    expect(carAhead(w, car(w, 'a'), 1)).toBeNull();
    expect(leader(w, car(w, 'e'), 1)?.id).toBe('a');
    expect(leader(w, car(w, 'a'), 1)?.id).toBe('b');
    const picks = new Set(Array.from({ length: 40 }, () => randomAhead(w, w.chaos!, car(w, 'e'), 1, 3)?.id));
    expect([...picks].sort()).toEqual(['a', 'b', 'c']);
    expect(randomAhead(w, w.chaos!, car(w, 'a'), 1, 3)).toBeNull();
  });
});

describe('Blue Screen', () => {
  it('blue-screens the car ahead for its time; a Firewall blocks it', () => {
    const w = world(['a', 0.6], ['b', 0.4]);
    const events = use(w, 'b', 'blueScreen');
    expect(events).toContainEqual({ type: 'itemHit', car: 'a', item: 'blueScreen', by: 'b', blocked: false });
    expect(car(w, 'a').blueScreenTicks).toBeGreaterThan(0);
    step(w, {}, cfg);
    for (let i = 0; i < secs(items.items.blueScreen.seconds); i++) step(w, {}, cfg);
    expect(car(w, 'a').blueScreenTicks).toBe(0);
    car(w, 'a').shieldTicks = 100;
    use(w, 'b', 'blueScreen');
    expect(car(w, 'a').blueScreenTicks).toBe(0);
    expect(car(w, 'a').shieldTicks).toBe(0);
  });
});

describe('Lag Spike', () => {
  it("the target's inputs arrive lagSpike.delaySeconds late while it lasts", () => {
    const w = world(['a', 0.5]);
    const a = car(w, 'a');
    const delay = secs(items.items.lagSpike.delaySeconds);
    // Steer right for a while, then left; with the lag the car still gets "right" for `delay` ticks.
    for (let i = 0; i < delay; i++) applyControlEffects(w.chaos!, a, { ...NO_INPUT, steer: 1 }, cfg);
    a.lagTicks = secs(items.items.lagSpike.seconds);
    const got = applyControlEffects(w.chaos!, a, { ...NO_INPUT, steer: -1 }, cfg);
    expect(got.steer).toBe(1);
    for (let i = 0; i < delay; i++) applyControlEffects(w.chaos!, a, { ...NO_INPUT, steer: -1 }, cfg);
    expect(applyControlEffects(w.chaos!, a, { ...NO_INPUT, steer: -1 }, cfg).steer).toBe(-1);
  });

  it('a Lag Spike hits the car ahead', () => {
    const w = world(['a', 0.6], ['b', 0.4]);
    use(w, 'b', 'lagSpike');
    expect(car(w, 'a').lagTicks).toBeGreaterThan(0);
  });
});

describe('Control Swap', () => {
  it('steering works the pedals and the pedals steer', () => {
    const out = (i: CarInput) => swapControls(i, { ...NO_INPUT }, items.items.controlSwap.steerThreshold);
    expect(out({ ...NO_INPUT, steer: 1 })).toMatchObject({ gas: true, brake: false, steer: 0 });
    expect(out({ ...NO_INPUT, steer: -1 })).toMatchObject({ gas: false, brake: true });
    expect(out({ ...NO_INPUT, gas: true }).steer).toBe(-1);
    expect(out({ ...NO_INPUT, brake: true }).steer).toBe(1);
  });

  it('hits the leader and swaps its controls while it lasts', () => {
    const w = world(['a', 0.9], ['b', 0.2]);
    use(w, 'b', 'controlSwap');
    const a = car(w, 'a');
    expect(a.controlSwapTicks).toBeGreaterThan(0);
    expect(applyControlEffects(w.chaos!, a, { ...NO_INPUT, gas: true }, cfg).steer).toBe(-1);
  });
});

describe('Forced Update', () => {
  it('holds the target still (brakes on) for up to maxSeconds; mashing keys finishes it sooner', () => {
    const w = world(['a', 0.6], ['b', 0.4]);
    use(w, 'b', 'forcedUpdate');
    const a = car(w, 'a');
    expect(a.updateTicks).toBe(secs(items.items.forcedUpdate.maxSeconds) - 1); // the hit tick already counts
    expect(applyControlEffects(w.chaos!, a, { ...NO_INPUT, gas: true, steer: 1 }, cfg)).toMatchObject({ gas: true, brake: true, steer: 0 });
    const lazy = a.updateTicks;
    applyControlEffects(w.chaos!, a, { ...NO_INPUT, mash: 3 }, cfg);
    expect(lazy - a.updateTicks).toBe(1 + 3 * Math.round(items.items.forcedUpdate.mashSeconds / dt));
  });
});

describe('Forced Update holds the car still', () => {
  it('a hit car brakes to a stop and never rolls backwards', () => {
    const w = world(['a', 0.6], ['b', 0.4]);
    const a = car(w, 'a');
    a.vx = Math.sin(a.yaw) * 15;
    a.vz = Math.cos(a.yaw) * 15;
    use(w, 'b', 'forcedUpdate');
    let minForward = Infinity;
    for (let i = 0; i < secs(items.items.forcedUpdate.maxSeconds) - 2; i++) {
      step(w, { a: { ...NO_INPUT, gas: true } }, cfg);
      minForward = Math.min(minForward, a.vx * Math.sin(a.yaw) + a.vz * Math.cos(a.yaw));
    }
    expect(minForward).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.hypot(a.vx, a.vz)).toBeLessThan(0.5);
  });
});

describe('Ctrl+Z clears every bad effect', () => {
  it('blue screen, lag, control swap and forced update all end', () => {
    const w = world(['a', 0.5]);
    const a = car(w, 'a');
    Object.assign(a, { blueScreenTicks: 50, lagTicks: 50, controlSwapTicks: 50, updateTicks: 50 });
    use(w, 'a', 'ctrlZ');
    expect([a.blueScreenTicks, a.lagTicks, a.controlSwapTicks, a.updateTicks]).toEqual([0, 0, 0, 0]);
  });
});
