import { describe, expect, it } from 'vitest';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { botInput } from '../bot/driver';
import { newBotMemory } from '../bot/engineer';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { createCarOnGrid, createWorld } from '../sim/car';
import { step } from '../sim/step';
import type { CarInput, SimEvent, World } from '../sim/types';
import { buildTrack } from '../track/build';
import { Rng } from '../util/rng';
import { applyEvents, gridOrder, isWrongWay, newRun, raceOver, results, standings, updateWrongWay, type RaceRun } from './rules';

const cfg = parseTuning(realTuning);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const dt = cfg.sim.dt;
const STATS = { speed: 1, grip: 1, weight: 1 };

/** Cars on grid spots 0..n-1 (car0 on pole), a fresh run, and bot memories. */
function race(n: number, laps: number): { world: World; run: RaceRun } {
  const cars = Array.from({ length: n }, (_, i) => createCarOnGrid(`car${i}`, STATS, track, i, cfg.race));
  const world = createWorld(track, cars);
  return { world, run: newRun(cars.map((c) => c.id), laps, 0) };
}

/** Drive with bots (cars listed in `slow` coast instead) until the race is over or time runs out. */
function drive(world: World, run: RaceRun, seconds: number, slow: string[] = []): SimEvent[] {
  const memory = new Map(world.cars.map((c) => [c.id, newBotMemory()]));
  const all: SimEvent[] = [];
  for (let t = 0; t < Math.round(seconds / dt); t++) {
    const inputs: Record<string, CarInput> = {};
    for (const c of world.cars) {
      inputs[c.id] = slow.includes(c.id) ? { steer: 0, gas: false, brake: false, respawn: false } : botInput(c, track, cfg, memory.get(c.id)!);
    }
    const events = step(world, inputs, cfg);
    all.push(...events);
    applyEvents(run, events, world.tick);
    updateWrongWay(run, world, cfg.race);
    if (raceOver(run, world.tick, cfg.race, dt)) break;
  }
  return all;
}

describe('race rules', () => {
  it('a lap counts after all sectors in order; the last lap finishes the car', () => {
    const { world, run } = race(1, 2);
    drive(world, run, 120);
    const r = run.cars.get('car0')!;
    expect(r.lapsDone).toBe(2);
    expect(r.sectorsDone).toBe(2 * track.gates.length);
    expect(r.finishTick).not.toBeNull();
    expect(r.bestLapTicks! * dt).toBeGreaterThan(30);
    expect(r.bestLapTicks! * dt).toBeLessThan(40);
    expect(run.finishOrder).toEqual(['car0']);
  });

  it('on the grid, pole is first; a car behind the line is not counted as a lap ahead', () => {
    const { world, run } = race(4, 1);
    expect(standings(run, world)).toEqual(['car0', 'car1', 'car2', 'car3']);
  });

  it('positions follow who is ahead on the road', () => {
    const { world, run } = race(2, 3);
    drive(world, run, 8, ['car0']); // car0 (pole) never moves; car1 drives off
    expect(standings(run, world)).toEqual(['car1', 'car0']);
  });

  it('after the winner, the others get the finish window, then DNF', () => {
    const { world, run } = race(2, 1);
    drive(world, run, 200, ['car1']); // car1 never starts
    const res = results(run, world);
    expect(res.map((r) => r.id)).toEqual(['car0', 'car1']);
    expect(res[0]).toMatchObject({ place: 1, dnf: false, lapsDone: 1 });
    expect(res[1]).toMatchObject({ place: 2, dnf: true, timeTicks: null });
    // The race ended exactly when the window closed after the winner.
    expect(world.tick - run.winnerTick!).toBe(Math.round(cfg.race.finishWindowSeconds / dt));
  });

  it('the race is over at once when everyone finished', () => {
    const { world, run } = race(1, 1);
    drive(world, run, 100);
    expect(raceOver(run, world.tick, cfg.race, dt)).toBe(true);
    expect(world.tick - run.winnerTick!).toBe(0);
  });

  it('flags driving the wrong way after wrongWaySeconds', () => {
    const { world, run } = race(1, 1);
    const car = world.cars[0]!;
    const s = track.samples[car.segment]!;
    car.yaw += Math.PI; // turned around
    car.vx = -s.dir.x * 10;
    car.vz = -s.dir.z * 10;
    const needed = Math.round(cfg.race.wrongWaySeconds / dt);
    for (let i = 0; i < needed - 1; i++) updateWrongWay(run, world, cfg.race);
    expect(isWrongWay(run.cars.get('car0')!, cfg.race, dt)).toBe(false);
    updateWrongWay(run, world, cfg.race);
    expect(isWrongWay(run.cars.get('car0')!, cfg.race, dt)).toBe(true);
    car.vx = s.dir.x * 10;
    car.vz = s.dir.z * 10;
    updateWrongWay(run, world, cfg.race);
    expect(isWrongWay(run.cars.get('car0')!, cfg.race, dt)).toBe(false);
  });
});

describe('grid order', () => {
  it('first race: a random but repeatable order', () => {
    const ids = ['car0', 'car1', 'car2', 'car3'];
    const a = gridOrder(ids, null, new Rng(5));
    expect([...a].sort()).toEqual(ids);
    expect(gridOrder(ids, null, new Rng(5))).toEqual(a);
  });

  it('then the previous results reversed (leaders at the back); newcomers in front', () => {
    const prev = ['car2', 'car0', 'car1'].map((id, i) => ({ id, place: i + 1, timeTicks: 1, bestLapTicks: 1, lapsDone: 1, dnf: false }));
    const order = gridOrder(['car0', 'car1', 'car2', 'car5'], prev, new Rng(1));
    expect(order).toEqual(['car5', 'car1', 'car0', 'car2']);
  });
});
