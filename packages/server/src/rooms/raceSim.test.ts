import { describe, expect, it } from 'vitest';
import { loadCarsFile, loadTrackFile, loadTuningFile } from '../config';
import { botInput, gridSpot, newBotMemory } from '@escape/shared';
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

describe('RaceSim new cars', () => {
  it('a car that appears mid-race starts ghosted', () => {
    const sim = soloSim('a');
    for (let i = 0; i < 120; i++) sim.tick();
    sim.addPlayer('b');
    sim.setSeat('b', 1, 'solo');
    expect(car(sim, 'car1').ghostUntilTick).toBeGreaterThan(sim.world.tick);
  });
});

describe('RaceSim race flow', () => {
  const countdown = Math.round(cfg.race.countdownSeconds / cfg.sim.dt);

  it('the first player is host; the host passes on when they leave or drop', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addPlayer('a');
    sim.addPlayer('b');
    sim.addPlayer('c');
    expect(sim.flow.host).toBe('a');
    sim.setConnected('a', false);
    expect(sim.flow.host).toBe('b');
    sim.removePlayer('b');
    expect(sim.flow.host).toBe('c');
    sim.setConnected('a', true); // back, but the host stays with c
    expect(sim.flow.host).toBe('c');
  });

  it('only the host starts; cars go to the grid, wait out the countdown, then race', () => {
    const sim = soloSim('a', 'b');
    sim.handleInput('a', { seq: 1, gas: true });
    for (let i = 0; i < 60; i++) sim.tick(); // lobby: free driving
    expect(moved(sim, 'car0')).toBeGreaterThan(5);
    expect(sim.startRace('b')).toMatch(/only the host/);
    expect(sim.startRace('a')).toBeNull();
    expect(sim.flow.phase).toBe('countdown');
    expect(moved(sim, 'car0')).toBeCloseTo(0); // back on the grid
    for (let i = 0; i < countdown - 1; i++) sim.tick(); // gas still held: ignored
    expect(moved(sim, 'car0')).toBeCloseTo(0);
    expect(sim.flow.phase).toBe('countdown');
    for (let i = 0; i < 30; i++) sim.tick();
    expect(sim.flow.phase).toBe('racing');
    expect(moved(sim, 'car0')).toBeGreaterThan(1); // GO
  });

  it('seats are locked from the countdown on, and open again after the race', () => {
    const sim = soloSim('a');
    sim.addPlayer('late');
    expect(sim.startRace('a')).toBeNull();
    expect(sim.setSeat('late', 3, 'solo')).toMatch(/locked/);
    expect(sim.leaveSeat('a')).toMatch(/locked/);
    sim.flow.phase = 'results'; // (race end arrives with the race rules in P3.3)
    expect(sim.setSeat('late', 3, 'solo')).toBeNull();
  });

  it('host sets laps between races and goes back to the lobby after the results', () => {
    const sim = soloSim('a');
    expect(sim.setLaps('a', 5)).toBeNull();
    expect(sim.flow.laps).toBe(5);
    expect(sim.setLaps('a', cfg.race.maxLaps + 1)).toMatch(/laps must be/);
    expect(sim.backToLobby('a')).toMatch(/only after a race/);
    sim.flow.phase = 'results';
    expect(sim.backToLobby('a')).toBeNull();
    expect(sim.flow.phase).toBe('lobby');
  });

  it('when everyone leaves the room returns to the lobby', () => {
    const sim = soloSim('a');
    sim.startRace('a');
    sim.removePlayer('a');
    expect(sim.flow.phase).toBe('lobby');
    expect(sim.flow.host).toBeNull();
  });
});

describe('RaceSim lobby', () => {
  it('host shuffle seats everyone connected in random pairs', () => {
    const sim = new RaceSim(track, cfg, stats);
    for (const id of ['a', 'b', 'c', 'd', 'e']) sim.addPlayer(id);
    expect(sim.shuffle('b')).toMatch(/only the host/);
    expect(sim.shuffle('a')).toBeNull();
    const seats = sim.seating();
    expect(seats.every((s) => s.seat !== null)).toBe(true);
    expect(sim.world.cars.map((c) => c.id)).toEqual(['car0', 'car1', 'car2']);
    expect(seats.filter((s) => s.seat === 'solo').length).toBe(1);
  });

  it('shuffle is refused during a race', () => {
    const sim = soloSim('a');
    sim.startRace('a');
    expect(sim.shuffle('a')).toMatch(/locked/);
  });

  it('teams can be renamed by their players or the host', () => {
    const sim = soloSim('a', 'b');
    expect(sim.teamNames[0]).toBe('Team 1'); // no teams.json given in this test
    expect(sim.setTeamName('b', 1, 'Speed Demons')).toBeNull();
    expect(sim.setTeamName('b', 0, 'Nope')).toMatch(/only the team/);
    expect(sim.setTeamName('a', 1, 'Host Pick')).toBeNull(); // a is host
    expect(sim.teamNames[1]).toBe('Host Pick');
    expect(sim.setTeamName('a', 99, 'x')).toMatch(/no such car/);
  });

  it('ready flags reset when a race starts; bots switch is host only', () => {
    const sim = soloSim('a', 'b');
    sim.setReady('b', true);
    expect(sim.isReady('b')).toBe(true);
    sim.startRace('a');
    expect(sim.isReady('b')).toBe(false);
    expect(sim.setBots('b', true)).toMatch(/only the host/);
    expect(sim.setBots('a', true)).toBeNull();
    expect(sim.botsEnabled).toBe(true);
  });
});

describe('RaceSim full race', () => {
  it('lobby → countdown → racing → results with laps, places and results', () => {
    const sim = soloSim('a');
    expect(sim.setLaps('a', 1)).toBeNull();
    expect(sim.startRace('a')).toBeNull();
    const memory = newBotMemory();
    for (let t = 0; t < 60 * 120 && sim.flow.phase !== 'results'; t++) {
      // Drive car0 with the bot driver as player "a" (solo, so it has every control).
      const car = sim.world.cars[0]!;
      const input = botInput(car, track, cfg, memory);
      sim.handleInput('a', { seq: t + 1, steer: input.steer, gas: input.gas, brake: input.brake });
      sim.tick();
      if (sim.flow.phase === 'racing') expect(sim.carRace('car0')?.place).toBe(1);
    }
    expect(sim.flow.phase).toBe('results');
    expect(sim.lastResults).toEqual([
      expect.objectContaining({ id: 'car0', place: 1, dnf: false, lapsDone: 1 }),
    ]);
    // Rematch: allowed from results, and the grid comes from the results.
    expect(sim.startRace('a')).toBeNull();
    expect(sim.flow.phase).toBe('countdown');
  });
});
