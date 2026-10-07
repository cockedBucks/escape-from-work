import { describe, expect, it } from 'vitest';
import { loadCarsFile, loadItemsFile, loadTrackFile, loadTuningFile } from '../config';
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

  it('a track switch reloads every page: the host keeps host while reconnecting (P10.7)', () => {
    const sim = new RaceSim(track, cfg, stats);
    for (const id of ['a', 'b', 'bot']) sim.addPlayer(id);
    sim.keepHostThroughReload();
    sim.setConnected('a', false);
    sim.setConnected('b', false);
    expect(sim.flow.host).toBe('a'); // the bot client that never reloads does not take over
    sim.setConnected('b', true);
    expect(sim.flow.host).toBe('a'); // nor whoever reloads first
    sim.setConnected('a', true);
    expect(sim.flow.host).toBe('a');
    sim.setConnected('a', false); // later drops follow the normal rules again
    expect(sim.flow.host).toBe('b');
  });

  it('a host whose seat expires during the reload hands host on', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addPlayer('a');
    sim.addPlayer('b');
    sim.keepHostThroughReload();
    sim.setConnected('a', false);
    sim.removePlayer('a');
    expect(sim.flow.host).toBe('b');
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
    // Gas held since before the countdown: the engine floods for a moment at GO (P13.3), then drives.
    for (let i = 0; i < 30 + Math.round(cfg.rocket.floodStallSeconds / cfg.sim.dt); i++) sim.tick();
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
    expect(sim.setBots('a', true)).toMatch(/not during a race/); // bots change between races only
    expect(sim.botsEnabled).toBe(false);
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

describe('RaceSim bot cars', () => {
  it('bots fill empty cars up to botFillCars; a person can take over a bot car', () => {
    const sim = soloSim('a');
    expect(sim.setBots('a', true)).toBeNull();
    expect(sim.world.cars.length).toBe(cfg.race.botFillCars);
    expect(sim.isBot('car0')).toBe(false);
    expect(sim.isBot('car1')).toBe(true);
    sim.addPlayer('b');
    expect(sim.setSeat('b', 1, 'solo')).toBeNull();
    expect(sim.isBot('car1')).toBe(false);
    expect(sim.world.cars.length).toBe(cfg.race.botFillCars); // another bot filled in
    expect(sim.setBots('a', false)).toBeNull();
    expect(sim.world.cars.map((c) => c.id)).toEqual(['car0', 'car1']);
  });

  it('a bots-only race runs to the results with the host watching', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addPlayer('h');
    sim.setBots('h', true);
    sim.setLaps('h', 1);
    expect(sim.startRace('h')).toBeNull();
    expect(sim.setBots('h', false)).toMatch(/not during a race/);
    for (let t = 0; t < 60 * 90 && sim.flow.phase !== 'results'; t++) sim.tick();
    expect(sim.flow.phase).toBe('results');
    expect(sim.lastResults!.filter((r) => !r.dnf).length).toBe(cfg.race.botFillCars);
    // Award counters for every car of the race (league, P9.3): bots brake for the corners.
    expect(sim.lastCounts.size).toBe(cfg.race.botFillCars);
    const braking = [...sim.lastCounts.values()].reduce((sum, c) => sum + c.brakeSeconds, 0);
    expect(braking).toBeGreaterThan(0);
  });
});

describe('RaceSim review fixes (P3.8)', () => {
  it('the host can end a race nobody finishes; everyone unfinished is DNF', () => {
    const sim = soloSim('a');
    sim.startRace('a');
    expect(sim.endRace('a')).toBeNull(); // countdown → lobby
    expect(sim.flow.phase).toBe('lobby');
    sim.startRace('a');
    for (let i = 0; i < 300; i++) sim.tick(); // racing, nobody moves
    expect(sim.flow.phase).toBe('racing');
    sim.addPlayer('b');
    expect(sim.endRace('b')).toMatch(/only the host/);
    expect(sim.endRace('a')).toBeNull();
    sim.tick();
    expect(sim.flow.phase).toBe('results');
    expect(sim.lastResults!.every((r) => r.dnf)).toBe(true);
  });

  it('no new bot appears mid-race when a seat empties', () => {
    const sim = soloSim('a', 'b');
    sim.setBots('a', true);
    const before = sim.world.cars.map((c) => c.id);
    sim.startRace('a');
    sim.removePlayer('b'); // e.g. reconnect window ran out
    expect(sim.world.cars.map((c) => c.id)).not.toContain('car1');
    expect(sim.world.cars.length).toBe(before.length - 1);
  });

  it('results keep every car until the lobby, even if its players leave', () => {
    const sim = soloSim('a', 'b');
    sim.setLaps('a', 1);
    sim.startRace('a');
    sim.endRace('a'); // countdown → lobby
    sim.startRace('a');
    for (let i = 0; i < 200; i++) sim.tick();
    sim.endRace('a');
    sim.tick();
    expect(sim.flow.phase).toBe('results');
    sim.removePlayer('b');
    expect(sim.world.cars.map((c) => c.id)).toEqual(['car0', 'car1']);
    expect(sim.backToLobby('a')).toBeNull();
    expect(sim.world.cars.map((c) => c.id)).toEqual(['car0']);
  });

  it('shuffle keeps players whose seat is held while they reconnect', () => {
    const sim = soloSim('a', 'b');
    sim.setConnected('b', false);
    sim.shuffle('a');
    expect(sim.seating().find((s) => s.id === 'b')!.seat).not.toBeNull();
  });
});

describe('RaceSim honk', () => {
  it('either player honks once per press, with a cooldown', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addPlayer('p');
    sim.addPlayer('e');
    sim.setSeat('p', 0, 'pilot');
    sim.setSeat('e', 0, 'engineer');
    const honks = (n: number): number => {
      let count = 0;
      for (let i = 0; i < n; i++) count += sim.tick().filter((ev) => ev.type === 'honk').length;
      return count;
    };
    sim.handleInput('e', { seq: 1, honk: true });
    expect(honks(60)).toBe(1); // held for a second: still one honk
    sim.handleInput('e', { seq: 2, honk: false });
    sim.handleInput('p', { seq: 1, honk: true }); // the Pilot may honk too
    expect(honks(1)).toBe(1);
    sim.handleInput('p', { seq: 2, honk: false });
    sim.handleInput('p', { seq: 3, honk: true }); // pressed again at once: cooldown
    expect(honks(1)).toBe(0);
  });
});

describe('RaceSim kart drift (Space: the Pilot, or one solo player)', () => {
  const seqs = new Map<string, number>();
  const send = (sim: RaceSim, id: string, msg: Record<string, unknown>): void => {
    const seq = (seqs.get(id) ?? 0) + 1;
    seqs.set(id, seq);
    sim.handleInput(id, { seq, ...msg });
  };
  const ticks = (sim: RaceSim, n: number): void => {
    for (let i = 0; i < n; i++) sim.tick();
  };
  const SPEED_UP = Math.round(1.2 / cfg.sim.dt);

  /** Engineer `e` gets up to speed; then `who` holds Space (drift key) while the Pilot steers right. */
  function duo(who: 'p' | 'e'): RaceSim {
    seqs.clear();
    const sim = new RaceSim(track, cfg, stats);
    sim.addPlayer('p');
    sim.addPlayer('e');
    sim.setSeat('p', 0, 'pilot');
    sim.setSeat('e', 0, 'engineer');
    send(sim, 'e', { gas: true });
    ticks(sim, SPEED_UP);
    send(sim, 'p', { steer: 1 });
    if (who === 'p') send(sim, 'p', { steer: 1, drift: true });
    else send(sim, 'e', { gas: true, drift: true });
    ticks(sim, 2);
    return sim;
  }

  it('the Pilot holding Space starts a drift', () => {
    expect(car(duo('p'), 'car0').driftDir).toBe(1);
  });

  it("the Engineer's drift key does nothing (their Space uses the item)", () => {
    expect(car(duo('e'), 'car0').driftDir).toBe(0);
  });

  it('a solo player drifts with Space', () => {
    seqs.clear();
    const sim = soloSim('s');
    send(sim, 's', { gas: true });
    ticks(sim, SPEED_UP);
    send(sim, 's', { gas: true, steer: 1, drift: true });
    ticks(sim, 2);
    expect(car(sim, 'car0').driftDir).toBe(1);
  });
});

describe('RaceSim swap lane and solo flag', () => {
  /** Put car0 just before the swap lane, on its side, on the lap the lane opens. */
  function toLane(sim: RaceSim): void {
    const lane = track.rangedZones.find((z) => z.type === 'swap')!;
    const i = Math.round((lane.from - 0.005) * track.samples.length);
    const s = track.samples[i]!;
    const c = car(sim, 'car0');
    const side = lane.side === 'right' ? 3 : -3;
    c.x = s.pos.x + s.right.x * side;
    c.z = s.pos.z + s.right.z * side;
    c.yaw = Math.atan2(s.dir.x, s.dir.z);
    c.vx = s.dir.x * 20;
    c.vz = s.dir.z * 20;
    c.segment = i;
    c.lap = lane.minLap;
    c.heat = 0.8;
  }

  it('driving into the open lane swaps Pilot and Engineer and cools the engine', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addPlayer('p');
    sim.addPlayer('e');
    sim.setSeat('p', 0, 'pilot');
    sim.setSeat('e', 0, 'engineer');
    toLane(sim);
    let swapped = false;
    for (let i = 0; i < 60 && !swapped; i++) swapped = sim.tick().some((ev) => ev.type === 'swap');
    expect(swapped).toBe(true);
    expect(sim.seatsSwapped).toBe(true);
    const seats = Object.fromEntries(sim.seating().map((s) => [s.id, s.seat]));
    expect(seats).toEqual({ p: 'engineer', e: 'pilot' });
    expect(car(sim, 'car0').heat).toBeLessThan(0.1);
  });

  it('a partner away (reconnecting) keeps their role: no seat swap, the engine still cools', () => {
    const sim = new RaceSim(track, cfg, stats);
    sim.addPlayer('p');
    sim.addPlayer('e');
    sim.setSeat('p', 0, 'pilot');
    sim.setSeat('e', 0, 'engineer');
    sim.setConnected('e', false);
    toLane(sim);
    let swapped = false;
    for (let i = 0; i < 60 && !swapped; i++) swapped = sim.tick().some((ev) => ev.type === 'swap');
    expect(swapped).toBe(true);
    expect(sim.seatsSwapped).toBe(false);
    expect(Object.fromEntries(sim.seating().map((s) => [s.id, s.seat]))).toEqual({ p: 'pilot', e: 'engineer' });
    expect(car(sim, 'car0').heat).toBeLessThan(0.1);
  });

  it('a solo car only gets the cooled engine; the solo flag follows who is in the car', () => {
    const sim = soloSim('s');
    sim.tick();
    expect(car(sim, 'car0').solo).toBe(true);
    toLane(sim);
    let swapped = false;
    for (let i = 0; i < 60 && !swapped; i++) swapped = sim.tick().some((ev) => ev.type === 'swap');
    expect(swapped).toBe(true);
    expect(sim.seatsSwapped).toBe(false);
    expect(sim.seating().find((s) => s.id === 's')!.seat).toBe('solo');

    const duo = new RaceSim(track, cfg, stats);
    duo.addPlayer('p');
    duo.addPlayer('e');
    duo.setSeat('p', 0, 'pilot');
    duo.setSeat('e', 0, 'engineer');
    duo.tick();
    expect(car(duo, 'car0').solo).toBe(false);
  });
});

describe('RaceSim chaos items', () => {
  const items = loadItemsFile();
  const drive = (sim: RaceSim, seconds: number) => {
    const n = Math.round(seconds / cfg.sim.dt);
    for (let i = 0; i < n; i++) sim.tick();
  };

  it('with chaos on, a car driving down the start straight picks up an item from the first row', () => {
    const sim = new RaceSim(track, cfg, stats, undefined, items);
    sim.addPlayer('a');
    sim.setSeat('a', 0, 'solo');
    sim.handleInput('a', { seq: 1, gas: true });
    drive(sim, 4);
    expect(car(sim, 'car0').item).not.toBe('');
  });

  it('with chaos switched off (or no items config) there are no boxes and no items', () => {
    const off = new RaceSim(track, cfg, stats, undefined, items);
    off.setChaos(false);
    expect(off.chaos).toBe(false);
    expect(off.world.chaos).toBeUndefined();
    off.addPlayer('a');
    off.setSeat('a', 0, 'solo');
    off.handleInput('a', { seq: 1, gas: true });
    drive(off, 4);
    expect(car(off, 'car0').item).toBe('');
    expect(new RaceSim(track, cfg, stats).chaos).toBe(false);
  });
});

describe('RaceSim firing items', () => {
  const items = loadItemsFile();

  function duoWithItem(): RaceSim {
    const sim = new RaceSim(track, cfg, stats, undefined, items);
    sim.addPlayer('p');
    sim.addPlayer('e');
    sim.setSeat('p', 0, 'pilot');
    sim.setSeat('e', 0, 'engineer');
    car(sim, 'car0').item = 'firewall';
    return sim;
  }

  it('only the Engineer fires (Space from the Pilot does nothing)', () => {
    const sim = duoWithItem();
    sim.handleInput('p', { seq: 1, fire: true });
    sim.tick();
    expect(car(sim, 'car0').item).toBe('firewall');
    sim.handleInput('e', { seq: 1, fire: true });
    const events = sim.tick();
    expect(events).toContainEqual({ type: 'itemUse', car: 'car0', item: 'firewall' });
  });

  it('fires once per press, not on every tick while Space is held', () => {
    const sim = duoWithItem();
    sim.handleInput('e', { seq: 1, fire: true });
    sim.tick();
    car(sim, 'car0').item = 'firewall'; // a new item while Space is still held
    sim.handleInput('e', { seq: 2, fire: true });
    sim.tick();
    expect(car(sim, 'car0').item).toBe('firewall');
  });
});

describe('RaceSim chaos toggle', () => {
  it('only the host switches chaos, and only between races', () => {
    const sim = new RaceSim(track, cfg, stats, undefined, loadItemsFile());
    sim.addPlayer('h');
    sim.addPlayer('g');
    sim.setSeat('h', 0, 'solo');
    expect(sim.hostSetChaos('g', false)).toMatch(/only the host/);
    expect(sim.chaos).toBe(true);
    expect(sim.hostSetChaos('h', false)).toBeNull();
    expect(sim.chaos).toBe(false);
    expect(sim.world.chaos).toBeUndefined();
    expect(sim.hostSetChaos('h', true)).toBeNull();
    expect(sim.world.chaos?.boxes.length).toBeGreaterThan(0);
  });
});

describe('RaceSim car picker', () => {
  const roster = loadCarsFile().cars;

  function lobby(): RaceSim {
    const sim = new RaceSim(track, cfg, stats);
    sim.setRoster(roster);
    sim.addPlayer('p');
    sim.addPlayer('e');
    sim.addPlayer('x');
    sim.setSeat('p', 0, 'pilot');
    sim.setSeat('e', 0, 'engineer');
    sim.setSeat('x', 1, 'solo');
    return sim;
  }

  it('every slot starts with a different roster car (slot N = car N)', () => {
    const sim = lobby();
    expect(sim.carModels.slice(0, roster.length)).toEqual(roster.map((d) => d.id));
  });

  it("either player of a car picks its car and the car gets that car's stats", () => {
    const sim = lobby();
    const heavy = roster.find((d) => d.id === 'help-desk')!;
    expect(sim.pickCar('e', 0, 'help-desk')).toBeNull();
    expect(sim.carModels[0]).toBe('help-desk');
    expect(car(sim, 'car0').stats).toEqual(heavy.stats);
    expect(sim.pickCar('p', 0, 'pocket-rocket')).toBeNull();
  });

  it("nobody else picks for a team; unknown cars and mid-race picks are refused", () => {
    const sim = lobby();
    expect(sim.pickCar('x', 0, 'cabbie')).toMatch(/only the players/);
    expect(sim.pickCar('p', 0, 'flying-car')).toMatch(/no such car model/);
    expect(sim.startRace('p')).toBeNull();
    expect(sim.pickCar('p', 0, 'cabbie')).toMatch(/not during a race/);
  });
});

describe('RaceSim battle mode (P11.6)', () => {
  const items = loadItemsFile();
  const battleSim = (): RaceSim => {
    const sim = new RaceSim(track, cfg, stats, undefined, items);
    for (const [id, slot] of [['a', 0], ['b', 1], ['c', 2]] as const) {
      sim.addPlayer(id);
      sim.setSeat(id, slot, 'solo');
    }
    return sim;
  };
  const toRacing = (sim: RaceSim): void => {
    for (let i = 0; i < 10_000 && sim.flow.phase !== 'racing'; i++) sim.tick();
  };

  it('only the host switches the mode, between races; a battle always has items', () => {
    const sim = battleSim();
    expect(sim.setMode('b', 'battle')).toMatch(/only the host/);
    expect(sim.hostSetChaos('a', false)).toBeNull();
    expect(sim.chaos).toBe(false);
    expect(sim.setMode('a', 'battle')).toBeNull();
    expect(sim.chaos).toBe(true);
    expect(sim.startRace('a')).toBeNull();
    toRacing(sim);
    expect(sim.setMode('a', 'race')).toMatch(/in the lobby/);
    expect(new RaceSim(track, cfg, stats).setMode('x', 'battle')).not.toBeNull();
  });

  it('every car starts with its lives; an out car stops, is see-through, and the last one standing wins', () => {
    const sim = battleSim();
    sim.setMode('a', 'battle');
    sim.startRace('a');
    toRacing(sim);
    expect(sim.carBattle('car1')).toEqual({ lives: cfg.battle.lives, out: false });
    // car1 and car2 are knocked out (the hit rules themselves are tested in shared).
    const battle = sim.battle!;
    for (const id of ['car1', 'car2']) {
      battle.lives.set(id, 0);
      battle.outTick.set(id, sim.world.tick);
    }
    sim.handleInput('b', { seq: 1, gas: true, steer: 0 });
    sim.tick();
    expect(sim.lastInputs['car1']?.gas).toBe(false); // out: controls ignored
    expect(car(sim, 'car1').ghostUntilTick).toBeGreaterThan(sim.world.tick - 1);
    expect(sim.flow.phase).toBe('results');
    expect(sim.lastResults?.map((r) => r.id)[0]).toBe('car0');
    expect(sim.lastResults?.find((r) => r.id === 'car1')?.dnf).toBe(true);
    // Laps never counted in a battle.
    expect(sim.carRace('car0')?.run.lapsDone).toBe(0);
  });

  it('time runs out: most lives wins', () => {
    const sim = battleSim();
    sim.setMode('a', 'battle');
    sim.startRace('a');
    toRacing(sim);
    sim.battle!.lives.set('car0', 1);
    sim.battle!.lives.set('car2', 2);
    for (let i = 0; i < Math.round(cfg.battle.timeLimitSeconds / cfg.sim.dt) + 1 && sim.flow.phase === 'racing'; i++) sim.tick();
    expect(sim.flow.phase).toBe('results');
    expect(sim.lastResults?.map((r) => r.id)).toEqual(['car1', 'car2', 'car0']);
  });
});

describe('RaceSim battle end (review fixes)', () => {
  const items = loadItemsFile();
  it('the final knockout and the results on the same tick: places come from the results', () => {
    const sim = new RaceSim(track, cfg, stats, undefined, items);
    for (const [id, slot] of [['a', 0], ['b', 1], ['c', 2]] as const) {
      sim.addPlayer(id);
      sim.setSeat(id, slot, 'solo');
    }
    sim.setMode('a', 'battle');
    sim.startRace('a');
    for (let i = 0; i < 10_000 && sim.flow.phase !== 'racing'; i++) sim.tick();
    sim.tick(); // places now: everyone tied on lives, by id
    // car0 and car1 go out together on the last tick: car2 wins.
    for (const id of ['car0', 'car1']) {
      sim.battle!.lives.set(id, 0);
      sim.battle!.outTick.set(id, sim.world.tick);
    }
    sim.tick();
    expect(sim.flow.phase).toBe('results');
    expect(sim.carRace('car2')?.place).toBe(1);
    expect(sim.lastResults?.[0]?.id).toBe('car2');
  });

  it('an out car picks up no item boxes; the mode changes only in the lobby', () => {
    const sim = new RaceSim(track, cfg, stats, undefined, items);
    for (const [id, slot] of [['a', 0], ['b', 1], ['c', 2]] as const) {
      sim.addPlayer(id);
      sim.setSeat(id, slot, 'solo');
    }
    sim.setMode('a', 'battle');
    sim.startRace('a');
    for (let i = 0; i < 10_000 && sim.flow.phase !== 'racing'; i++) sim.tick();
    sim.battle!.lives.set('car1', 0);
    sim.battle!.outTick.set('car1', sim.world.tick);
    sim.tick();
    const out = car(sim, 'car1');
    expect(out.out).toBe(true);
    // Park it on an item box: it must not take it.
    const box = sim.world.chaos!.boxes[0]!;
    out.x = box.x;
    out.z = box.z;
    out.item = '';
    sim.tick();
    expect(out.item).toBe('');
    expect(box.respawnAtTick).toBe(0);
    expect(sim.setMode('a', 'race')).toMatch(/lobby/);
  });
});

describe('RaceSim rocket start (P13.3)', () => {
  const countdown = Math.round(cfg.race.countdownSeconds / cfg.sim.dt);
  /** Start a 2-car solo race; `a` presses gas `aEarly` s before GO, `b` holds it from the start. Runs to just after GO. */
  function start(aEarly: number): { sim: RaceSim; events: string[] } {
    const sim = soloSim('a', 'b');
    expect(sim.startRace('a')).toBeNull();
    sim.handleInput('b', { seq: 1, gas: true });
    const events: string[] = [];
    const press = countdown - Math.round(aEarly / cfg.sim.dt);
    for (let i = 0; i < countdown + 3; i++) {
      if (i === press) sim.handleInput('a', { seq: 1, gas: true });
      for (const e of sim.tick()) if (e.type === 'rocketStart' || e.type === 'flooded') events.push(`${e.type}:${e.car}`);
    }
    return { sim, events };
  }

  it('gas on "1" = rocket start (boost); gas held from "3" = flooded engine', () => {
    const { sim, events } = start(cfg.rocket.windowSeconds * 0.5);
    expect(sim.flow.phase).toBe('racing');
    expect(events).toEqual(['rocketStart:car0', 'flooded:car1']);
    expect(car(sim, 'car0').boostTicks).toBeGreaterThan(0);
    expect(car(sim, 'car1').stallUntilTick).toBeGreaterThan(sim.world.tick);
  });

  it('gas a bit early (not on "3") is a normal start', () => {
    const { events } = start((cfg.rocket.windowSeconds + cfg.rocket.floodSeconds) / 2);
    expect(events).toEqual(['flooded:car1']);
  });
});
