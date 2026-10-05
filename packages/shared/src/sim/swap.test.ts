import { describe, expect, it } from 'vitest';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { parseTrack } from '../config/track';
import { parseTuning, type Tuning } from '../config/tuning';
import { buildTrack } from '../track/build';
import { createCar, createWorld } from './car';
import { step } from './step';
import { NO_INPUT, type CarInput, type CarState, type SimEvent, type World } from './types';

const cfg = parseTuning(realTuning);
const dt = cfg.sim.dt;
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const lane = track.rangedZones.find((z) => z.type === 'swap')!;
const GAS: CarInput = { ...NO_INPUT, gas: true };

/** A car on the right half of the road at `progress`, driving along the track at `speed`. */
function carAt(progress: number, lateral: number, speed: number): World {
  const s = track.samples[Math.round(progress * track.samples.length) % track.samples.length]!;
  const car = createCar('a', { speed: 1, grip: 1, weight: 1 }, track);
  car.x = s.pos.x + s.right.x * lateral;
  car.z = s.pos.z + s.right.z * lateral;
  car.yaw = Math.atan2(s.dir.x, s.dir.z);
  car.vx = s.dir.x * speed;
  car.vz = s.dir.z * speed;
  car.segment = Math.round(progress * track.samples.length) % track.samples.length;
  car.lastGate = track.gates.length - 1; // past every gate but the finish line
  return createWorld(track, [car]);
}

function run(w: World, n: number, input: CarInput = GAS, c: Tuning = cfg): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...step(w, { a: input }, c));
  return events;
}

const car = (w: World): CarState => w.cars[0]!;
const throughLane = Math.round(((lane.to - lane.from + 0.03) * track.length) / 20 / dt);

describe('swap lane', () => {
  it('lap 1: the lane is closed (no swap)', () => {
    const w = carAt(lane.from - 0.01, 3, 20);
    expect(run(w, throughLane).some((e) => e.type === 'swap')).toBe(false);
  });

  it('from minLap, entering it swaps once and fully cools the engine (even a stalled one)', () => {
    const w = carAt(lane.from - 0.01, 3, 20);
    car(w).lap = lane.minLap;
    car(w).heat = 1;
    car(w).stallUntilTick = 10_000;
    let ticksLeft = throughLane;
    while (ticksLeft-- > 0 && !run(w, 1).some((e) => e.type === 'swap'));
    expect(ticksLeft).toBeGreaterThan(0); // it swapped
    expect(car(w).heat).toBe(0);
    expect(car(w).stallUntilTick).toBe(-1);
    expect(car(w).swappedLap).toBe(lane.minLap);
    // Still in the lane for the rest of it: no second swap this lap.
    expect(run(w, ticksLeft).some((e) => e.type === 'swap')).toBe(false);
  });

  it('only on its side of the road', () => {
    const w = carAt(lane.from - 0.01, -3, 20);
    car(w).lap = lane.minLap;
    expect(run(w, throughLane).some((e) => e.type === 'swap')).toBe(false);
  });

  it('the lane is slower than the road next to it', () => {
    const top = cfg.car.topSpeed;
    const inLane = carAt(lane.from + 0.002, 3, top);
    const beside = carAt(lane.from + 0.002, -3, top);
    run(inLane, 30);
    run(beside, 30);
    const speed = (w: World) => Math.hypot(car(w).vx, car(w).vz);
    expect(speed(inLane)).toBeLessThan(speed(beside) - 2);
  });

  it('crossing the finish line starts the next lap', () => {
    const w = carAt(0.995, 0, 20);
    run(w, 30);
    expect(car(w).lap).toBe(2);
  });
});

describe('solo handicap', () => {
  it('solo.speedMultiplier slows only solo cars; 1 (the default) changes nothing', () => {
    const slow: Tuning = { ...cfg, solo: { speedMultiplier: 0.8 } };
    const solo = createWorld(track, [createCar('a', { speed: 1, grip: 1, weight: 1 }, track)]);
    const duo = createWorld(track, [createCar('a', { speed: 1, grip: 1, weight: 1 }, track)]);
    const soloDefault = createWorld(track, [createCar('a', { speed: 1, grip: 1, weight: 1 }, track)]);
    solo.cars[0]!.solo = true;
    soloDefault.cars[0]!.solo = true;
    run(solo, 120, GAS, slow);
    run(duo, 120, GAS, slow);
    run(soloDefault, 120, GAS, cfg);
    const x = (w: World) => w.cars[0]!.x;
    expect(x(solo)).toBeLessThan(x(duo) - 3);
    expect(x(soloDefault)).toBeCloseTo(x(duo), 6);
  });
});
