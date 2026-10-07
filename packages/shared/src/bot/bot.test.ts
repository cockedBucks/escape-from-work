import { describe, expect, it } from 'vitest';
import officeJson from '../../../../config/tracks/office.json';
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
import { botPedals, cornerReverses, newBotMemory, plannedSpeed } from './engineer';
import { botDrift, botSteer } from './pilot';
import { botInput } from './driver';
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
    expect(Math.abs(botSteer(car, track, cfg))).toBeLessThan(0.15);
    car.yaw += 0.4; // turned left of the road: steer right
    expect(botSteer(car, track, cfg)).toBeGreaterThan(0.5);
    car.yaw -= 0.8; // turned right: steer left
    expect(botSteer(car, track, cfg)).toBeLessThan(-0.5);
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

  it('when stuck, backs up (up to maxBackUps times), then presses respawn after stuckSeconds', () => {
    const car = createCar('a', STATS, track); // never moves: these pedals are not simulated
    const memory = newBotMemory();
    const ticks = (s: number) => Math.round(s / cfg.sim.dt);
    for (let k = 0; k < cfg.bot.maxBackUps; k++) {
      for (let i = 0; i < ticks(cfg.bot.backUpAfter) - 1; i++) expect(botPedals(car, track, cfg, memory).brake).toBe(false);
      for (let i = 0; i < ticks(cfg.bot.backUpSeconds); i++) {
        expect(botPedals(car, track, cfg, memory)).toMatchObject({ gas: false, brake: true, respawn: false });
      }
    }
    for (let i = 0; i < ticks(cfg.bot.stuckSeconds) - 1; i++) expect(botPedals(car, track, cfg, memory).respawn).toBe(false);
    expect(botPedals(car, track, cfg, memory).respawn).toBe(true);
    expect(memory.stuckTicks).toBe(0);
  });

  it('lets go of the gas at bot.heatLiftAt, and a stalled engine is not "stuck"', () => {
    const car = createCar('a', STATS, track);
    expect(botPedals(car, track, cfg, newBotMemory()).gas).toBe(true);
    car.heat = cfg.bot.heatLiftAt;
    expect(botPedals(car, track, cfg, newBotMemory()).gas).toBe(false);
    car.stallUntilTick = 1;
    const memory = newBotMemory();
    for (let i = 0; i < Math.round((cfg.bot.stuckSeconds * 2) / cfg.sim.dt); i++) {
      expect(botPedals(car, track, cfg, memory).respawn).toBe(false);
    }
  });
});

describe('golden: bot laps on the Test Loop', () => {
  // GOLDEN: change these windows only for an intended feel change, and say so in the commit.
  // Measured at P5.6a: lap 1 35.57 s, flying 34.60 s (only nitro heats the engine now and plain
  // bots never burn nitro, so this matches P2.8 again; P5.1–P5.5 with gas heat: ~37 s).
  const race = runBotRace(track, cfg, { cars: 1, laps: 3, maxSeconds: 300 });

  it('finishes 3 laps without respawning', () => {
    expect(race.finished).toBe(true);
    expect(race.cars[0]!.respawns).toBe(0);
  });

  it('lap times stay inside the golden window', () => {
    const [first, ...flying] = race.cars[0]!.lapTimes;
    expect(first).toBeGreaterThan(33.8);
    expect(first).toBeLessThan(37.4);
    for (const lap of flying) {
      expect(lap).toBeGreaterThan(32.9);
      expect(lap).toBeLessThan(36.4);
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
    expect(race.hash).toBe('2feabac7');
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

describe('bot skills (drift, nitro)', () => {
  /** A car 10 m before the hairpin, moving along the track at `speed`, wheel turned into it. */
  function beforeHairpin(speed: number) {
    const i = (hairpin - 5 + track.samples.length) % track.samples.length;
    const s = track.samples[i]!;
    const car = createCar('a', STATS, track);
    car.x = s.pos.x;
    car.z = s.pos.z;
    car.yaw = Math.atan2(s.dir.x, s.dir.z);
    car.vx = s.dir.x * speed;
    car.vz = s.dir.z * speed;
    car.segment = i;
    car.steer = -Math.sign(track.samples[hairpin]!.curvature); // hard into the corner
    return car;
  }
  const fast = cfg.car.topSpeed * cfg.drift.minSpeedRatio * 1.2;

  it('a plain bot never drifts or burns nitro', () => {
    const car = beforeHairpin(fast);
    car.nitro = 1;
    const p = botPedals(car, track, cfg, newBotMemory(0));
    expect(p.nitro).toBe(false);
    expect(botDrift(car, track, cfg, car.steer, 0)).toBe(false);
  });

  it('a skilled Engineer holds the gas (no brake) while the Pilot drifts', () => {
    const car = beforeHairpin(fast);
    const memory = newBotMemory(1);
    car.driftDir = car.steer;
    car.heat = cfg.bot.heatLiftAt; // hot, but still under the drift limit
    expect(botPedals(car, track, cfg, memory)).toMatchObject({ gas: true, brake: false });
  });

  it('a skilled Pilot holds Space before a tight corner (steering into it or straight), not when steering out', () => {
    const car = beforeHairpin(fast);
    const into = -Math.sign(track.samples[hairpin]!.curvature);
    expect(botDrift(car, track, cfg, into, 1)).toBe(true);
    expect(botDrift(car, track, cfg, 0, 1)).toBe(true);
    expect(botDrift(car, track, cfg, -into, 1)).toBe(false); // it would drift the wrong way
    expect(botDrift(beforeHairpin(cfg.car.topSpeed * cfg.drift.minSpeedRatio * 0.5), track, cfg, into, 1)).toBe(false); // too slow
    car.driftDir = into;
    expect(botDrift(car, track, cfg, into, 1)).toBe(true); // keeps it down through the corner
  });

  it('skill 2 burns nitro only with meter, on a clear straight, with a cool engine', () => {
    const car = createCar('a', STATS, track); // start line: a long straight ahead
    const f = forward(car.yaw);
    car.vx = f.x * 15;
    car.vz = f.z * 15;
    expect(botPedals(car, track, cfg, newBotMemory(2)).nitro).toBe(false); // empty meter
    car.nitro = 1;
    expect(botPedals(car, track, cfg, newBotMemory(2)).nitro).toBe(true);
    car.heat = cfg.bot.nitroMaxHeat;
    expect(botPedals(car, track, cfg, newBotMemory(2)).nitro).toBe(false);
    expect(botPedals(beforeHairpin(fast), track, cfg, newBotMemory(2)).nitro).toBe(false);
  });
});

describe('skilled bots on real corners', () => {
  const office = buildTrack(parseTrack(officeJson, 'office'), cfg.track);

  it('a skilled Pilot lets go of Space once the corner is over (boost)', () => {
    const car = createCar('a', STATS, track); // start line: a long straight ahead
    car.driftDir = 1;
    const f = forward(car.yaw);
    car.vx = f.x * 25;
    car.vz = f.z * 25;
    expect(botDrift(car, track, cfg, 0, 1)).toBe(false);
  });

  it('spots S-bends (a tight corner the other way soon after this one)', () => {
    const at = (t: typeof track, i: number) => ({ ...createCar('a', STATS, t), segment: i });
    const tight = cfg.bot.driftMinCurvature;
    // The Test Loop hairpin turns one way only.
    const c = track.samples[hairpin]!.curvature;
    expect(cornerReverses(at(track, hairpin - 5), track, cfg.bot.driftClearAhead, c, tight)).toBe(false);
    // The Office kitchen chicane (0.37–0.47 of the lap) does reverse.
    const n = office.samples.length;
    let found = false;
    for (let i = Math.round(0.37 * n); i < Math.round(0.47 * n); i++) {
      const ci = office.samples[i]!.curvature;
      if (Math.abs(ci) >= tight && cornerReverses(at(office, i), office, cfg.bot.driftClearAhead, ci, tight)) found = true;
    }
    expect(found).toBe(true);
  });

  it('a bot spun round in the narrow shortcut backs out and drives on without a respawn', () => {
    const closet = office.branches[0]!;
    const s = closet.samples[Math.floor(closet.samples.length / 2)]!;
    const drive = (tuning: typeof cfg) => {
      const car = createCar('a', STATS, office);
      car.yaw = Math.atan2(s.dir.x, s.dir.z) + 2.8; // spun almost all the way round, facing a wall
      car.x = s.pos.x + s.right.x * (s.width / 2 - cfg.car.radius);
      car.z = s.pos.z + s.right.z * (s.width / 2 - cfg.car.radius);
      car.segment = Math.floor(s.progress * office.samples.length);
      const world = createWorld(office, [car]);
      const memory = newBotMemory(2);
      let respawned = false;
      for (let t = 0; t < Math.round(6 / tuning.sim.dt); t++) {
        for (const e of step(world, { a: botInput(car, office, tuning, memory) }, tuning)) if (e.type === 'respawn') respawned = true;
      }
      return { respawned, progress: car.progress };
    };
    const backedUp = drive(cfg);
    expect(backedUp.respawned).toBe(false);
    expect(backedUp.progress).toBeGreaterThan(s.progress); // on its way again
    // The same spot really is stuck: without backing up or turning round, the bot has to respawn.
    expect(drive({ ...cfg, bot: { ...cfg.bot, maxBackUps: 0, turnAroundAngle: Math.PI } }).respawned).toBe(true);
  });

  it('turns round (reverses with the wheel turned) when the road ahead is behind it', () => {
    const car = createCar('a', STATS, track); // stopped on the start straight…
    car.yaw += Math.PI; // …facing backwards
    const memory = newBotMemory();
    expect(botPedals(car, track, cfg, memory)).toMatchObject({ gas: false, brake: true });
    expect(memory.turnTicks).toBeGreaterThan(0);
    car.vx = -forward(car.yaw).x * 3; // rolling backwards: the Pilot steers the other way round
    car.vz = -forward(car.yaw).z * 3;
    const reversing = botSteer(car, track, cfg);
    car.vx = -car.vx;
    car.vz = -car.vz;
    expect(Math.sign(reversing)).toBe(-Math.sign(botSteer(car, track, cfg)));
    car.yaw -= Math.PI; // facing the road again: done turning, back on the gas
    car.vx = 0;
    car.vz = 0;
    expect(botPedals(car, track, cfg, memory)).toMatchObject({ gas: true, brake: false });
    expect(memory.turnTicks).toBe(0);
  });

  it('drifting bots lap The Office (chicane, jump, shortcut) without hitting a wall', () => {
    for (const skill of [1, 2]) {
      const race = runBotRace(office, cfg, { cars: 1, laps: 2, maxSeconds: 200, skill });
      expect(race.finished).toBe(true);
      expect(race.cars[0]!.wallHits).toBe(0);
    }
  });
});

describe('balance: teamwork pays, without being overpowered', () => {
  // A skilled bot team (drifts, boosts, nitro, heat) against a plain one on the Test Loop.
  const plain = runBotRace(track, cfg, { cars: 1, laps: 3, maxSeconds: 300, skill: 0 });
  const skilled = runBotRace(track, cfg, { cars: 1, laps: 3, maxSeconds: 300, skill: 2 });
  const total = (r: typeof plain) => r.cars[0]!.lapTimes.reduce((a, b) => a + b, 0);

  it('the skilled bot finishes cleanly', () => {
    expect(skilled.finished).toBe(true);
    expect(skilled.cars[0]!.respawns).toBe(0);
  });

  it('is faster by a share of race time inside bot.balanceGain', () => {
    const gain = 1 - total(skilled) / total(plain);
    const [min, max] = cfg.bot.balanceGain;
    expect(gain).toBeGreaterThan(min);
    expect(gain).toBeLessThan(max);
  });
});
