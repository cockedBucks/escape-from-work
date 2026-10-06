import { describe, expect, it } from 'vitest';
import realItems from '../../../../config/items.json';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { parseItems } from '../config/items';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { createCar, createWorld } from '../sim/car';
import { step } from '../sim/step';
import { NO_INPUT, type CarInput, type World } from '../sim/types';
import { buildTrack } from '../track/build';
import { createChaos } from './chaos';

const cfg = parseTuning(realTuning);
const items = parseItems(realItems);
const dt = cfg.sim.dt;
const secs = (s: number): number => Math.round(s / dt);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const GAS: CarInput = { ...NO_INPUT, gas: true };
const FIRE: CarInput = { ...GAS, fire: true };

function world(): World {
  const w = createWorld(track, [createCar('a', { speed: 1, grip: 1, weight: 1 }, track)]);
  w.chaos = createChaos(track, items, 1);
  w.chaos.boxes = [];
  return w;
}

/** Drive with gas for `seconds`, remembering where the car was every tick. */
function driveAndRecord(w: World, seconds: number): { x: number; z: number }[] {
  const path: { x: number; z: number }[] = [];
  for (let i = 0; i < secs(seconds); i++) {
    step(w, { a: GAS }, cfg);
    path.push({ x: w.cars[0]!.x, z: w.cars[0]!.z });
  }
  return path;
}

describe('Ctrl+Z', () => {
  it('puts the car back where it was ctrlZ.seconds ago and ghosts it briefly', () => {
    const w = world();
    const path = driveAndRecord(w, 6);
    const car = w.cars[0]!;
    car.item = 'ctrlZ';
    const now = w.tick;
    step(w, { a: FIRE }, cfg);
    const back = path[path.length - 1 - secs(items.items.ctrlZ.seconds)]!;
    // Within one history sample (plus the one tick it drives after rewinding).
    const slack = 30 * (items.items.ctrlZ.sampleSeconds + 2 * dt);
    expect(Math.hypot(car.x - back.x, car.z - back.z)).toBeLessThan(slack);
    expect(car.ghostUntilTick).toBeGreaterThan(now + 1);
  });

  it('clears a spin-out and a stall, and the heat goes back too', () => {
    const w = world();
    driveAndRecord(w, 4);
    const car = w.cars[0]!;
    car.spinTicks = 50;
    car.heat = 1;
    car.stallUntilTick = w.tick + 100;
    car.item = 'ctrlZ';
    step(w, { a: FIRE }, cfg);
    expect(car.spinTicks).toBe(0);
    expect(car.stallUntilTick).toBe(-1);
    expect(car.heat).toBeLessThan(0.1);
    expect(car.item).toBe('');
  });

  it('early in a race it goes back to the oldest pose it has; a second Ctrl+Z starts from there', () => {
    const w = world();
    const start = { x: w.cars[0]!.x, z: w.cars[0]!.z };
    driveAndRecord(w, 1);
    const car = w.cars[0]!;
    car.item = 'ctrlZ';
    step(w, { a: FIRE }, cfg);
    expect(Math.hypot(car.x - start.x, car.z - start.z)).toBeLessThan(3);
    car.item = 'ctrlZ';
    const before = { x: car.x, z: car.z };
    step(w, { a: NO_INPUT }, cfg);
    step(w, { a: FIRE }, cfg);
    expect(Math.hypot(car.x - before.x, car.z - before.z)).toBeLessThan(1); // no history left yet
  });
});
