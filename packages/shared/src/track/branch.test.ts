import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import { newBotMemory } from '../bot/engineer';
import { botInput } from '../bot/driver';
import { botRoute } from '../bot/route';
import { runBotRace } from '../bot/race';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { createCar, createWorld } from '../sim/car';
import { step } from '../sim/step';
import { closestOnSegment, dist, type Vec2 } from '../util/math';
import { buildTrack, insideOtherRoad, type Track, type TrackSample } from './build';
import { locateOnTrack, zonesAt } from './locate';
import { checkTrack } from './validate';

const tuning = parseTuning(realTuning);
const cfg = tuning.track;
const STATS = { speed: 1, grip: 1, weight: 1 };

/** Rounded box loop; the shortcut cuts the inside of the first corner. */
function boxTrack(branchPoints = [{ x: 205, z: 35, width: 7 }], extra: Record<string, unknown> = {}): Track {
  const points = [
    { x: 0, z: 0, width: 14 }, { x: 120, z: 0, width: 14 }, { x: 200, z: 0, width: 14 },
    { x: 240, z: 40, width: 14 }, { x: 240, z: 120, width: 14 }, { x: 200, z: 160, width: 14 },
    { x: 40, z: 160, width: 14 }, { x: -40, z: 120, width: 14 }, { x: -40, z: 40, width: 14 },
  ];
  const def = parseTrack(
    {
      id: 'box', name: 'Box', theme: 'test', laps: 3, points, sectors: 4, props: [], start: { at: 0 },
      zones: [{ type: 'slick', from: 0.18, to: 0.3, side: 'right' }],
      branches: [{ name: 'cut', from: 0.17, to: 0.36, points: branchPoints }],
      ...extra,
    },
    'box',
  );
  return buildTrack(def, cfg);
}

/** Closest wall distance minus half the road width at that sample (< 0 = a wall on the road). */
function clearance(track: Track, s: TrackSample): number {
  let best = Infinity;
  for (const w of track.walls) best = Math.min(best, dist(s.pos, closestOnSegment(s.pos, w.a, w.b).point));
  return best - s.width / 2;
}

describe('track branches (shortcuts)', () => {
  const track = boxTrack();
  const branch = track.branches[0]!;
  const main = (p: number): TrackSample => track.samples[Math.round(p * track.samples.length)]!;

  it('starts and ends on the main centerline, with progress mapped from..to', () => {
    expect(dist(branch.samples[0]!.pos, main(0.17).pos)).toBeLessThan(0.01);
    expect(dist(branch.samples.at(-1)!.pos, main(0.36).pos)).toBeLessThan(0.01);
    expect(branch.samples[0]!.progress).toBeCloseTo(0.17);
    expect(branch.samples.at(-1)!.progress).toBeCloseTo(0.36);
    for (let i = 1; i < branch.samples.length; i++) {
      expect(branch.samples[i]!.progress).toBeGreaterThan(branch.samples[i - 1]!.progress);
    }
    expect(branch.length).toBeLessThan((0.36 - 0.17) * track.length);
  });

  it('locates a car on the shortcut, with main-loop progress and no main-loop zones', () => {
    const mid = branch.samples[Math.floor(branch.samples.length / 2)]!;
    const loc = locateOnTrack(track, mid.pos);
    expect(loc.road).toBe(1);
    expect(loc.onTrack).toBe(true);
    expect(loc.progress).toBeGreaterThan(0.17);
    expect(loc.progress).toBeLessThan(0.36);
    expect(loc.segment).toBe(Math.floor(loc.progress * track.samples.length));
    // The slick on the main road's right side covers this progress, but not the shortcut.
    expect(zonesAt(track, loc)).toEqual([]);
    expect(locateOnTrack(track, main(0.25).pos).road).toBe(0);
  });

  it('opens the junctions: no wall on either road', () => {
    for (const s of branch.samples) expect(clearance(track, s)).toBeGreaterThan(-0.1);
    for (const s of track.samples) expect(clearance(track, s)).toBeGreaterThan(-0.1);
  });

  it('passes the geometry check, and flags a too-narrow or longer shortcut', () => {
    expect(checkTrack(track, cfg.minWidth, cfg.branchMinWidth).issues).toEqual([]);
    const narrow = boxTrack([{ x: 205, z: 35, width: cfg.branchMinWidth - 1 }]);
    expect(checkTrack(narrow, cfg.minWidth, cfg.branchMinWidth).issues.join()).toContain('narrower');
    const detour = boxTrack([{ x: 150, z: 60, width: 7 }, { x: 230, z: 70, width: 7 }]);
    expect(checkTrack(detour, cfg.minWidth, cfg.branchMinWidth).issues.join()).toContain('not shorter');
  });

  it('a car on the shortcut is not pushed through the main wall behind it', () => {
    // Just past the wedge tip, on the shortcut, behind the main road's right wall.
    const at = branch.samples[Math.floor(branch.samples.length * 0.3)]!;
    const car = createCar('a', STATS, track);
    const world = createWorld(track, [car]);
    car.x = at.pos.x;
    car.z = at.pos.z;
    car.yaw = Math.atan2(at.dir.x, at.dir.z);
    car.segment = locateOnTrack(track, at.pos).segment;
    step(world, {}, tuning);
    expect(dist({ x: car.x, z: car.z }, at.pos)).toBeLessThan(0.5);
  });

  it('skilled bots take the shortcut and finish without getting stuck; plain bots stay on the main road', () => {
    // In the shortcut's own corridor (not where it still overlaps the main road)?
    const inCorridor = (p: Vec2, car: { segment: number }): boolean =>
      locateOnTrack(track, p, car.segment).road === 1 && !insideOtherRoad(track, p, 1);
    const corridorTicks = (skill: number): number => {
      const car = createCar('a', STATS, track);
      const world = createWorld(track, [car]);
      const memory = newBotMemory(skill);
      let ticks = 0;
      for (let t = 0; t < 30 / tuning.sim.dt; t++) {
        step(world, { a: botInput(car, track, tuning, memory) }, tuning);
        if (inCorridor({ x: car.x, z: car.z }, car)) ticks++;
      }
      return ticks;
    };
    expect(corridorTicks(tuning.bot.shortcutSkill)).toBeGreaterThan(0);
    expect(corridorTicks(0)).toBe(0);
    const race = runBotRace(track, tuning, { cars: 2, laps: 3, maxSeconds: 300, skill: tuning.bot.shortcutSkill });
    expect(race.finished).toBe(true);
    expect(race.cars.reduce((n, c) => n + c.respawns, 0)).toBe(0);
  });

  it('a bot that missed the entrance follows the main road for that shortcut', () => {
    const car = createCar('a', STATS, track);
    const m = main(0.25);
    car.x = m.pos.x;
    car.z = m.pos.z;
    car.segment = Math.round(0.25 * track.samples.length);
    expect(botRoute(car, track, tuning, tuning.bot.shortcutSkill)).toEqual([]);
    car.segment = Math.round(0.05 * track.samples.length);
    expect(botRoute(car, track, tuning, tuning.bot.shortcutSkill)).toEqual([0]);
  });
});
