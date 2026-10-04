import { describe, expect, it } from 'vitest';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { buildTrack } from '../track/build';
import { forward } from '../util/math';
import { createCar, createWorld, placeAtGate } from './car';
import { step } from './step';
import { NO_INPUT, type CarInput, type SimEvent, type World } from './types';

const cfg = parseTuning(realTuning);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const STATS = { speed: 1, grip: 1, weight: 1 };
const GAS: CarInput = { ...NO_INPUT, gas: true };
const secs = (s: number): number => Math.round(s / cfg.sim.dt);

function newWorld(): World {
  return createWorld(track, [createCar('a', STATS, track)]);
}

/** Run `n` ticks with one input for car "a"; returns all events. */
function run(world: World, input: CarInput, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...step(world, { a: input }, cfg));
  return events;
}

const carA = (w: World) => w.cars[0]!;
const speed = (w: World) => Math.hypot(carA(w).vx, carA(w).vz);

describe('sim on the Test Loop', () => {
  it('starts on the start line facing along the straight (+X)', () => {
    const c = carA(newWorld());
    expect(c.x).toBeCloseTo(0);
    expect(c.z).toBeCloseTo(0);
    expect(forward(c.yaw).x).toBeCloseTo(1, 2);
    expect(c.lastGate).toBe(0);
  });

  it('holding gas drives forward down the straight', () => {
    const w = newWorld();
    run(w, GAS, secs(2));
    expect(carA(w).x).toBeGreaterThan(20);
    expect(Math.abs(carA(w).z)).toBeLessThan(0.5);
    expect(speed(w)).toBeGreaterThan(15);
    expect(carA(w).progress).toBeGreaterThan(0.02);
  });

  it('steering right turns toward the car\'s right (+Z here)', () => {
    const w = newWorld();
    run(w, GAS, secs(1));
    const yaw0 = carA(w).yaw;
    run(w, { ...GAS, steer: 1 }, secs(0.4));
    expect(carA(w).yaw).toBeLessThan(yaw0 - 0.2);
    expect(carA(w).z).toBeGreaterThan(0.5);
  });

  it('bounces off a wall, loses speed and reports the hit', () => {
    const w = newWorld();
    const c = carA(w);
    // Mid-straight, driving straight at the right wall (z = +8 here).
    c.x = 50;
    c.z = 0;
    c.yaw = 0; // facing +Z
    c.vx = 0;
    c.vz = 20;
    const events = run(w, NO_INPUT, secs(0.6));
    const hits = events.filter((e) => e.type === 'wallHit');
    expect(hits.length).toBe(1);
    expect(hits[0]!.type === 'wallHit' && hits[0]!.speed).toBeGreaterThan(15);
    expect(c.z).toBeLessThan(8 - cfg.car.radius + 0.01);
    expect(c.vz).toBeLessThan(0); // bounced back
    expect(Math.abs(c.vz)).toBeLessThan(20 * cfg.car.wallBounce + 1);
  });

  it('scraping along a wall is not a hit and keeps most speed', () => {
    const w = newWorld();
    const c = carA(w);
    c.x = 20;
    c.z = 8 - cfg.car.radius - 0.05;
    c.yaw = Math.PI / 2; // facing +X
    c.vx = 25;
    c.vz = 1;
    const events = run(w, GAS, secs(0.5));
    expect(events.some((e) => e.type === 'wallHit')).toBe(false);
    expect(c.vx).toBeGreaterThan(22);
    expect(c.z).toBeLessThanOrEqual(8 - cfg.car.radius + 0.01);
  });

  it('never ends up outside the walls driving into one for a long time', () => {
    const w = newWorld();
    const c = carA(w);
    c.x = 60;
    c.yaw = 0.3;
    run(w, { ...GAS, steer: -1 }, secs(3));
    // Half the road is 8 m here; the car's center can get no closer to a wall than its radius.
    expect(Math.abs(c.lateral)).toBeLessThan(8 - cfg.car.radius + 0.05);
  });

  it('jumps off the ramp once and lands with an event', () => {
    const w = newWorld();
    let maxY = 0;
    const events: SimEvent[] = [];
    for (let i = 0; i < secs(6); i++) {
      events.push(...step(w, { a: GAS }, cfg));
      maxY = Math.max(maxY, carA(w).y);
    }
    expect(events.filter((e) => e.type === 'jump').length).toBe(1);
    expect(events.filter((e) => e.type === 'land').length).toBe(1);
    expect(maxY).toBeGreaterThan(0.5);
  });

  it('cannot steer or accelerate in the air', () => {
    const w = newWorld();
    const c = carA(w);
    const yaw0 = c.yaw;
    c.vx = 10;
    c.y = 2;
    run(w, { ...GAS, steer: 1 }, 3);
    expect(c.vx).toBeCloseTo(10);
    expect(c.yaw).toBe(yaw0);
  });

  it('is slippery on the slick zone', () => {
    const w = newWorld();
    const c = carA(w);
    const slick = track.rangedZones.find((z) => z.type === 'slick')!;
    const sample = track.samples[Math.round(((slick.from + slick.to) / 2) * track.samples.length)]!;
    c.x = sample.pos.x;
    c.z = sample.pos.z;
    c.segment = Math.round(((slick.from + slick.to) / 2) * track.samples.length);
    run(w, NO_INPUT, 1);
    expect(c.onSlick).toBe(true);
  });

  it('counts checkpoints only in order', () => {
    const w = newWorld();
    const c = carA(w);
    // Teleport to sector 3: skipped gates do not count.
    placeAtGate(c, track, track.gates[3]!);
    c.lastGate = 0;
    expect(run(w, NO_INPUT, 2).some((e) => e.type === 'checkpoint')).toBe(false);
    expect(c.lastGate).toBe(0);
    // Into sector 1: counts.
    placeAtGate(c, track, track.gates[1]!);
    c.lastGate = 0;
    const events = run(w, NO_INPUT, 2);
    expect(events).toContainEqual({ type: 'checkpoint', car: 'a', gate: 1 });
    expect(c.lastGate).toBe(1);
  });

  it('respawn: fades with no control, then reappears on the last gate, stopped and ghosted', () => {
    const w = newWorld();
    const c = carA(w);
    placeAtGate(c, track, track.gates[2]!);
    run(w, GAS, secs(1));
    const fadeTicks = secs(cfg.race.respawnFadeSeconds);
    const start = run(w, { ...GAS, respawn: true }, 1);
    expect(start).toContainEqual({ type: 'respawnStart', car: 'a', reason: 'button' });
    const speedAtStart = speed(w);
    const during = run(w, GAS, fadeTicks - 1);
    expect(speed(w)).toBeLessThan(speedAtStart); // gas ignored while fading
    expect(during.some((e) => e.type === 'respawn')).toBe(false);
    const after = run(w, GAS, 1);
    expect(after).toContainEqual({ type: 'respawn', car: 'a', gate: 2 });
    expect(c.x).toBeCloseTo(track.gates[2]!.pos.x);
    expect(c.z).toBeCloseTo(track.gates[2]!.pos.z);
    expect(c.yaw).toBeCloseTo(track.gates[2]!.yaw);
    expect(speed(w)).toBe(0);
    expect(c.ghostUntilTick).toBe(w.tick + secs(cfg.race.respawnGhostSeconds));
  });

  it('respawns by itself when far outside the road', () => {
    const w = newWorld();
    const c = carA(w);
    c.x = 0;
    c.z = 40; // in the infield
    const events = run(w, NO_INPUT, 1);
    expect(events).toContainEqual({ type: 'respawnStart', car: 'a', reason: 'offTrack' });
  });

  it('is deterministic: same inputs give the same world', () => {
    const script = (i: number): CarInput => ({
      steer: Math.sin(i / 37) > 0.3 ? 1 : Math.sin(i / 37) < -0.3 ? -1 : 0,
      gas: i % 200 < 170,
      brake: i % 200 >= 185,
      respawn: i === 900,
    });
    const play = () => {
      const w = createWorld(track, [createCar('b', STATS, track, 0, 3), createCar('a', STATS, track, 0, -3)]);
      const events: SimEvent[] = [];
      for (let i = 0; i < 1500; i++) events.push(...step(w, { a: script(i), b: script(i + 50) }, cfg));
      return { cars: w.cars, events };
    };
    const one = play();
    expect(one.cars.map((c) => c.id)).toEqual(['a', 'b']);
    expect(play()).toEqual(one);
  });
});
