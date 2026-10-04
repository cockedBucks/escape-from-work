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
