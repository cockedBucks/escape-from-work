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
import { forward } from '../util/math';
import { createChaos } from './chaos';

const cfg = parseTuning(realTuning);
const items = parseItems(realItems);
const dt = cfg.sim.dt;
const secs = (s: number): number => Math.round(s / dt);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const gate = track.gates[0]!;
const STATS = { speed: 1, grip: 1, weight: 1 };
const FIRE: CarInput = { ...NO_INPUT, fire: true };

/** Cars on the start straight, `ahead` m along it (+X) and `side` m to the right; no boxes. */
function world(...spots: [string, number, number?][]): World {
  const f = forward(gate.yaw);
  const r = { x: f.z, z: -f.x }; // the driver's right
  const cars = spots.map(([id, ahead, side = 0]) => {
    const c = createCar(id, STATS, track);
    c.x = gate.pos.x + f.x * ahead + r.x * side;
    c.z = gate.pos.z + f.z * ahead + r.z * side;
    c.yaw = gate.yaw;
    return c;
  });
  const w = createWorld(track, cars);
  w.chaos = createChaos(track, items, 1);
  w.chaos.boxes = [];
  return w;
}

const car = (w: World, id: string): CarState => w.cars.find((c) => c.id === id)!;

function run(w: World, n: number, inputs: Record<string, CarInput> = {}): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...step(w, inputs, cfg));
  return events;
}

const hits = (events: SimEvent[]) => events.filter((e) => e.type === 'itemHit');

describe('using items', () => {
  it('fire uses the held item once and empties the slot; nothing to use = nothing happens', () => {
    const w = world(['a', 0]);
    car(w, 'a').item = 'firewall';
    const events = run(w, 1, { a: FIRE });
    expect(events).toContainEqual({ type: 'itemUse', car: 'a', item: 'firewall' });
    expect(car(w, 'a').item).toBe('');
    expect(run(w, 1, { a: FIRE }).some((e) => e.type === 'itemUse')).toBe(false);
  });

  it('a spinning car cannot use its item', () => {
    const w = world(['a', 0]);
    car(w, 'a').item = 'firewall';
    car(w, 'a').spinTicks = 10;
    run(w, 1, { a: FIRE });
    expect(car(w, 'a').item).toBe('firewall');
  });
});

describe('Reply-All', () => {
  it('flies ahead and spins out the car in front; its sender is safe at first', () => {
    const w = world(['a', 0], ['b', 25]);
    car(w, 'a').item = 'replyAll';
    const events = run(w, secs(1.5), { a: FIRE });
    expect(hits(events)).toEqual([{ type: 'itemHit', car: 'b', item: 'replyAll', by: 'a', blocked: false }]);
    expect(car(w, 'b').spinTicks).toBeGreaterThan(0);
    expect(car(w, 'a').spinTicks).toBe(0);
    expect(w.chaos!.envelopes).toEqual([]);
  });

  it('the Pilot holding Q aims it backward at the car behind', () => {
    const w = world(['a', 30], ['b', 5]);
    car(w, 'a').item = 'replyAll';
    const events = run(w, secs(1.5), { a: { ...FIRE, aimBack: true } });
    expect(hits(events).map((e) => e.type === 'itemHit' && e.car)).toEqual(['b']);
  });

  it('bounces off the road edge a few times, then is gone; expires after its life', () => {
    const w = world(['a', 0]);
    const a = car(w, 'a');
    a.yaw = gate.yaw - Math.PI / 2; // facing the right-hand edge
    a.item = 'replyAll';
    run(w, 1, { a: FIRE });
    w.cars = []; // only the envelope (it would otherwise come back and hit its sender)
    let maxBounces = 0;
    for (let i = 0; i < secs(items.items.replyAll.lifeSeconds) && w.chaos!.envelopes.length > 0; i++) {
      run(w, 1);
      maxBounces = Math.max(maxBounces, w.chaos!.envelopes[0]?.bounces ?? maxBounces);
    }
    expect(maxBounces).toBe(items.items.replyAll.bounces);
    expect(w.chaos!.envelopes).toEqual([]);
  });
});

describe('Firewall', () => {
  it('absorbs one hit (blocked, no spin) and is used up', () => {
    const w = world(['a', 0], ['b', 25]);
    car(w, 'a').item = 'replyAll';
    car(w, 'b').item = 'firewall';
    run(w, 1, { b: FIRE });
    expect(car(w, 'b').shieldTicks).toBeGreaterThan(0);
    const events = run(w, secs(1.5), { a: FIRE });
    expect(hits(events)).toEqual([{ type: 'itemHit', car: 'b', item: 'replyAll', by: 'a', blocked: true }]);
    expect(car(w, 'b').spinTicks).toBe(0);
    expect(car(w, 'b').shieldTicks).toBe(0);
  });

  it('runs out after its time', () => {
    const w = world(['a', 0]);
    car(w, 'a').item = 'firewall';
    run(w, 1, { a: FIRE });
    run(w, secs(items.items.firewall.seconds) + 1);
    expect(car(w, 'a').shieldTicks).toBe(0);
  });
});

describe('Coffee Spill', () => {
  it('drops a puddle behind; a car driving into it spins out; its owner is safe at first', () => {
    const w = world(['a', 10], ['b', -10]);
    car(w, 'a').item = 'coffeeSpill';
    run(w, 1, { a: FIRE });
    expect(w.chaos!.puddles).toHaveLength(1);
    const p = w.chaos!.puddles[0]!;
    expect(Math.hypot(p.x - car(w, 'a').x, p.z - car(w, 'a').z)).toBeCloseTo(items.items.coffeeSpill.dropBack, 0);
    // b drives forward into it.
    const events = run(w, secs(3), { b: { ...NO_INPUT, gas: true } });
    expect(hits(events).map((e) => e.type === 'itemHit' && e.car)).toEqual(['b']); // once, not again when the spin ends
  });

  it('dries up after its time', () => {
    const w = world(['a', 0]);
    car(w, 'a').item = 'coffeeSpill';
    run(w, 1, { a: FIRE });
    run(w, secs(items.items.coffeeSpill.seconds) + 1);
    expect(w.chaos!.puddles).toEqual([]);
  });
});

describe('spin-out', () => {
  it('takes away control: the car twirls and slows down, gas does nothing', () => {
    const w = world(['a', 0]);
    const a = car(w, 'a');
    const f = forward(a.yaw);
    a.vx = f.x * 20;
    a.vz = f.z * 20;
    a.spinTicks = secs(1);
    const yaw0 = a.yaw;
    run(w, secs(0.5), { a: { ...NO_INPUT, gas: true } });
    expect(Math.hypot(a.vx, a.vz)).toBeLessThan(20 * Math.exp(-items.spin.slowPerSec * 0.5) + 0.01);
    expect(a.yaw).not.toBeCloseTo(yaw0, 1);
    run(w, secs(0.6));
    expect(a.spinTicks).toBe(0);
  });
});
