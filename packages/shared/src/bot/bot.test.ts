import { describe, expect, it } from 'vitest';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { createCar, createWorld, placeAtGate } from '../sim/car';
import { hashWorld } from '../sim/hash';
import { step } from '../sim/step';
import type { CarInput } from '../sim/types';
import { buildTrack } from '../track/build';
import { forward } from '../util/math';
import { botPedals, newBotMemory, plannedSpeed } from './engineer';
import { botSteer } from './pilot';
import { runBotRace } from './race';

const cfg = parseTuning(realTuning);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const STATS = { speed: 1, grip: 1, weight: 1 };

/** Sample index of the tightest curve (the hairpin). */
const hairpin = track.samples.reduce((best, s, i) =>
  Math.abs(s.curvature) > Math.abs(track.samples[best]!.curvature) ? i : best, 0);

describe('bot pilot', () => {
  it('holds straight on the straight and corrects when turned away', () => {
    const car = createCar('a', STATS, track);
    expect(Math.abs(botSteer(car, track, cfg.bot))).toBeLessThan(0.15);
    car.yaw += 0.4; // turned left of the road: steer right
    expect(botSteer(car, track, cfg.bot)).toBeGreaterThan(0.5);
    car.yaw -= 0.8; // turned right: steer left
    expect(botSteer(car, track, cfg.bot)).toBeLessThan(-0.5);
  });
});

describe('bot engineer', () => {
  it('plans a lower speed before the hairpin than on the straight', () => {
    const car = createCar('a', STATS, track);
    const straight = plannedSpeed(car, track, cfg);
    car.segment = (hairpin - 10 + track.samples.length) % track.samples.length;
    const before = plannedSpeed(car, track, cfg);
    car.segment = hairpin;
    const at = plannedSpeed(car, track, cfg);
    expect(before).toBeLessThan(straight);
    expect(at).toBeLessThan(before);
    // Corner speed for the tightest radius: sqrt(cornerAccel × radius).
    expect(at).toBeCloseTo(Math.sqrt(cfg.bot.cornerAccel / Math.abs(track.samples[hairpin]!.curvature)), 5);
  });

  it('gasses from a standstill and brakes when far too fast for the next corner', () => {
    const car = createCar('a', STATS, track);
    expect(botPedals(car, track, cfg, newBotMemory())).toMatchObject({ gas: true, brake: false });
    car.segment = (hairpin - 10 + track.samples.length) % track.samples.length;
    const f = forward(car.yaw);
    car.vx = f.x * cfg.car.topSpeed;
    car.vz = f.z * cfg.car.topSpeed;
    expect(botPedals(car, track, cfg, newBotMemory())).toMatchObject({ gas: false, brake: true });
  });

  it('presses respawn after being stuck for stuckSeconds', () => {
    const car = createCar('a', STATS, track);
    const memory = newBotMemory();
    const stuckTicks = Math.round(cfg.bot.stuckSeconds / cfg.sim.dt);
    for (let i = 0; i < stuckTicks - 1; i++) expect(botPedals(car, track, cfg, memory).respawn).toBe(false);
    expect(botPedals(car, track, cfg, memory).respawn).toBe(true);
    expect(memory.stuckTicks).toBe(0);
  });
});

describe('golden: bot laps on the Test Loop', () => {
  // GOLDEN: change these windows only for an intended feel change, and say so in the commit.
  // Measured at P1.4: lap 1 (standing start) 37.40 s, flying laps 36.00 s.
  const race = runBotRace(track, cfg, { cars: 1, laps: 3, maxSeconds: 300 });

  it('finishes 3 laps without respawning', () => {
    expect(race.finished).toBe(true);
    expect(race.cars[0]!.respawns).toBe(0);
  });

  it('lap times stay inside the golden window', () => {
    const [first, ...flying] = race.cars[0]!.lapTimes;
    expect(first).toBeGreaterThan(35.5);
    expect(first).toBeLessThan(39.5);
    for (const lap of flying) {
      expect(lap).toBeGreaterThan(34.2);
      expect(lap).toBeLessThan(37.8);
    }
  });
});

describe('golden: replay determinism', () => {
  it('replaying recorded inputs gives the same world hash', () => {
    const recorded: Record<string, CarInput>[] = [];
    const race = runBotRace(track, cfg, { cars: 2, laps: 1, maxSeconds: 120, onInputs: (i) => recorded.push(i) });

    const half = (track.samples[track.gates[0]!.sample]!.width) / 2;
    const replay = createWorld(track, [
      createCar('bot1', STATS, track, 0, -0.5 * half),
      createCar('bot2', STATS, track, 0, 0.5 * half),
    ]);
    for (const inputs of recorded) step(replay, inputs, cfg);
    expect(hashWorld(replay)).toBe(race.hash);
  });

  it('the 2-car 1-lap race hash is pinned', () => {
    // GOLDEN: any change to physics, bot or Test Loop changes this. Update it only when the
    // change is intended, and say so in the commit message.
    const race = runBotRace(track, cfg, { cars: 2, laps: 1, maxSeconds: 120 });
    expect(race.hash).toBe('a71bcb87');
  });

  it('hash notices a tiny difference', () => {
    const a = createWorld(track, [createCar('a', STATS, track)]);
    const b = createWorld(track, [createCar('a', STATS, track)]);
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.cars[0]!.x += 1e-12;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    placeAtGate(b.cars[0]!, track, track.gates[0]!);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
