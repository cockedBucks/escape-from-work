import { describe, expect, it } from 'vitest';
import { loadCarsFile, loadTrackFile, loadTuningFile } from '../config';
import { gridSpot } from '@escape/shared';
import { RaceSim } from './raceSim';

const cfg = loadTuningFile();
const track = loadTrackFile('test-loop', cfg);
const stats = loadCarsFile().cars[0]!.stats;

/** A sim with one player per id, each driving their own car solo (slot = index). */
function soloSim(...ids: string[]): RaceSim {
  const sim = new RaceSim(track, cfg, stats);
  ids.forEach((id, slot) => {
    sim.addPlayer(id);
    expect(sim.setSeat(id, slot, 'solo')).toBeNull();
  });
  return sim;
}

const car = (sim: RaceSim, id: string) => sim.world.cars.find((c) => c.id === id)!;

/** How far a car is from its starting grid spot (m). */
function moved(sim: RaceSim, id: string): number {
  const c = car(sim, id);
  const spot = gridSpot(track, Number(id.slice(3)), cfg.race);
  return Math.hypot(c.x - spot.pos.x, c.z - spot.pos.z);
}

describe('RaceSim players and cars', () => {
  it('a car appears when someone sits in its slot and goes when they leave', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addPlayer('p1');
    expect(sim.world.cars).toEqual([]);
    expect(sim.setSeat('p1', 2, 'pilot')).toBeNull();
    expect(sim.world.cars.map((c) => c.id)).toEqual(['car2']);
    sim.leaveSeat('p1');
    expect(sim.world.cars).toEqual([]);
  });

  it('two players can share a car; the seat rules are enforced', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addPlayer('a');
    sim.addPlayer('b');
    sim.addPlayer('c');
    expect(sim.setSeat('a', 0, 'pilot')).toBeNull();
    expect(sim.setSeat('b', 0, 'pilot')).toMatch(/taken/);
    expect(sim.setSeat('b', 0, 'engineer')).toBeNull();
    expect(sim.setSeat('c', 0, 'solo')).toMatch(/already/);
    expect(sim.setSeat('c', cfg.race.maxCars, 'solo')).toMatch(/no such car/);
    expect(sim.world.cars.map((c) => c.id)).toEqual(['car0']);
    expect(sim.seating().filter((s) => s.slot === 0).map((s) => s.seat)).toEqual(['pilot', 'engineer']);
  });

  it('cars stay sorted by id whatever order seats are taken in', () => {
    const sim = new RaceSim(track, cfg, stats);
    for (const [id, slot] of [['x', 5], ['y', 1], ['z', 3]] as const) {
      sim.addPlayer(id);
      sim.setSeat(id, slot, 'solo');
    }
    expect(sim.world.cars.map((c) => c.id)).toEqual(['car1', 'car3', 'car5']);
  });

  it('a player holding gas moves their car; others coast', () => {
    const sim = soloSim('a', 'b');
    expect(sim.handleInput('a', { seq: 1, gas: true })).toBe(true);
    for (let i = 0; i < 60; i++) sim.tick();
    expect(moved(sim, 'car0')).toBeGreaterThan(5);
    expect(moved(sim, 'car1')).toBeCloseTo(0);
  });

  it('drops malformed, stale and unknown-player inputs', () => {
    const sim = soloSim('a');
    expect(sim.handleInput('a', { seq: 5, gas: true })).toBe(true);
    expect(sim.handleInput('a', { seq: 4, gas: false })).toBe(false); // older
    expect(sim.handleInput('a', { seq: 5, gas: false })).toBe(false); // repeat
    expect(sim.handleInput('a', { seq: 6, x: 999 })).toBe(false); // positions are never accepted
    expect(sim.handleInput('ghost', { seq: 1, gas: true })).toBe(false);
    for (let i = 0; i < 30; i++) sim.tick();
    expect(moved(sim, 'car0')).toBeGreaterThan(1); // still on gas from seq 5
  });

  it('removes the car when its only player leaves', () => {
    const sim = soloSim('a', 'b');
    sim.removePlayer('a');
    expect(sim.world.cars.map((c) => c.id)).toEqual(['car1']);
    expect(sim.handleInput('a', { seq: 1, gas: true })).toBe(false);
    expect(() => sim.tick()).not.toThrow();
  });
});

describe('RaceSim live config', () => {
  it('setTrack puts every car back on the start line; setStats updates every car', () => {
    const sim = soloSim('a');
    sim.handleInput('a', { seq: 1, gas: true });
    for (let i = 0; i < 60; i++) sim.tick();
    expect(moved(sim, 'car0')).toBeGreaterThan(5);
    sim.setTrack(loadTrackFile('test-loop', cfg));
    expect(moved(sim, 'car0')).toBeCloseTo(0);
    sim.setStats({ speed: 1.05, grip: 1, weight: 1 });
    expect(car(sim, 'car0').stats.speed).toBe(1.05);
  });

  it('keeps sim.dt and track settings until a restart', () => {
    const sim = new RaceSim(track, cfg, stats);
    const next = structuredClone(cfg);
    next.car.topSpeed = 31;
    expect(sim.setConfig(next)).toBe(false);
    next.sim.dt = 1 / 30;
    expect(sim.setConfig(next)).toBe(true);
  });
});

describe('RaceSim respawn', () => {
  it('respawn fires once per press, not on every tick while R is held or resent', () => {
    const sim = soloSim('a');
    sim.handleInput('a', { seq: 1, respawn: true });
    const fade = Math.round(cfg.race.respawnFadeSeconds / cfg.sim.dt);
    let starts = 0;
    for (let i = 0; i < fade * 3; i++) {
      sim.handleInput('a', { seq: 2 + i, respawn: true }); // still held, resent every tick
      starts += sim.tick().filter((e) => e.type === 'respawnStart').length;
    }
    expect(starts).toBe(1);
    sim.handleInput('a', { seq: 10_000, respawn: false });
    sim.handleInput('a', { seq: 10_001, respawn: true });
    for (let i = 0; i < fade + 2; i++) starts += sim.tick().filter((e) => e.type === 'respawnStart').length;
    expect(starts).toBe(2);
  });
});

describe('RaceSim role permissions', () => {
  function pair(): RaceSim {
    const sim = new RaceSim(track, cfg, stats);
    sim.addPlayer('pilot');
    sim.addPlayer('eng');
    sim.setSeat('pilot', 0, 'pilot');
    sim.setSeat('eng', 0, 'engineer');
    return sim;
  }

  it('a Pilot pressing gas does not move the car; the Engineer does', () => {
    const sim = pair();
    sim.handleInput('pilot', { seq: 1, gas: true, steer: 0 });
    for (let i = 0; i < 60; i++) sim.tick();
    expect(moved(sim, 'car0')).toBeCloseTo(0);
    sim.handleInput('eng', { seq: 1, gas: true });
    for (let i = 0; i < 60; i++) sim.tick();
    expect(moved(sim, 'car0')).toBeGreaterThan(5);
  });

  it('only the Pilot steers', () => {
    const sim = pair();
    sim.handleInput('eng', { seq: 1, gas: true, steer: 1 });
    for (let i = 0; i < 60; i++) sim.tick();
    expect(car(sim, 'car0').steer).toBe(0);
    sim.handleInput('pilot', { seq: 1, steer: 1 });
    for (let i = 0; i < 30; i++) sim.tick();
    expect(car(sim, 'car0').steer).toBeGreaterThan(0.5);
  });

  it('when the Engineer leaves, the Pilot drives solo with the pedals too', () => {
    const sim = pair();
    sim.removePlayer('eng');
    sim.handleInput('pilot', { seq: 1, gas: true });
    for (let i = 0; i < 60; i++) sim.tick();
    expect(moved(sim, 'car0')).toBeGreaterThan(5);
  });
});
