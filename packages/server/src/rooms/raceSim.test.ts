import { describe, expect, it } from 'vitest';
import { loadCarsFile, loadTrackFile, loadTuningFile } from '../config';
import { RaceSim } from './raceSim';

const cfg = loadTuningFile();
const track = loadTrackFile('test-loop', cfg);
const stats = loadCarsFile().cars[0]!.stats;

describe('RaceSim', () => {
  it('a player holding gas moves forward; others coast', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addCar('b');
    sim.addCar('a');
    expect(sim.world.cars.map((c) => c.id)).toEqual(['a', 'b']);
    expect(sim.handleInput('a', { seq: 1, gas: true })).toBe(true);
    for (let i = 0; i < 60; i++) sim.tick();
    const [a, b] = sim.world.cars;
    expect(a!.x).toBeGreaterThan(5);
    expect(b!.x).toBeCloseTo(0);
  });

  it('drops malformed, stale and unknown-player inputs', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addCar('a');
    expect(sim.handleInput('a', { seq: 5, gas: true })).toBe(true);
    expect(sim.handleInput('a', { seq: 4, gas: false })).toBe(false); // older
    expect(sim.handleInput('a', { seq: 5, gas: false })).toBe(false); // repeat
    expect(sim.handleInput('a', { seq: 6, x: 999 })).toBe(false); // positions are never accepted
    expect(sim.handleInput('ghost', { seq: 1, gas: true })).toBe(false);
    for (let i = 0; i < 30; i++) sim.tick();
    expect(sim.world.cars[0]!.x).toBeGreaterThan(1); // still on gas from seq 5
  });

  it('removes a car when its player leaves', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addCar('a');
    sim.addCar('b');
    sim.removeCar('a');
    expect(sim.world.cars.map((c) => c.id)).toEqual(['b']);
    expect(sim.handleInput('a', { seq: 1, gas: true })).toBe(false);
    expect(() => sim.tick()).not.toThrow();
  });
});

describe('RaceSim live config', () => {
  it('setTrack puts every car back on the start line; setStats updates every car', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addCar('a');
    sim.handleInput('a', { seq: 1, gas: true });
    for (let i = 0; i < 60; i++) sim.tick();
    expect(sim.world.cars[0]!.x).toBeGreaterThan(5);
    sim.setTrack(loadTrackFile('test-loop', cfg));
    expect(sim.world.cars[0]!.x).toBeCloseTo(0);
    sim.setStats({ speed: 1.05, grip: 1, weight: 1 });
    expect(sim.world.cars[0]!.stats.speed).toBe(1.05);
  });
});

describe('RaceSim respawn and restart-only settings', () => {
  it('respawn fires once per press, not on every tick while R is held or resent', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addCar('a');
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

  it('keeps sim.dt and track settings until a restart', () => {
    const sim = new RaceSim(track, cfg, stats);
    const next = structuredClone(cfg);
    next.car.topSpeed = 31;
    expect(sim.setConfig(next)).toBe(false);
    next.sim.dt = 1 / 30;
    expect(sim.setConfig(next)).toBe(true);
  });
});
