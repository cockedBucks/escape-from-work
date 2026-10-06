import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { newRun, updateWrongWay } from '../race/rules';
import { createCar, createWorld } from '../sim/car';
import { step } from '../sim/step';
import { NO_INPUT, type SimEvent } from '../sim/types';
import { angleDiff, clamp, cross, distSq, length, sub, yawOf, type Vec2 } from '../util/math';
import { buildTrack, insideRoad, type Track } from './build';
import { locateOnTrack, zonesAt } from './locate';
import { checkTrack } from './validate';

const tuning = parseTuning(realTuning);
const cfg = tuning.track;

/**
 * A circle (radius 100, turning right, so its inside is on the right) with a shortcut that
 * cuts through the inside from 10% to 35% of the lap.
 */
function circleWithShortcut(): Track {
  const count = 16;
  const points = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: Math.cos(a) * 100, z: Math.sin(a) * 100, width: 16 };
  });
  const at = (frac: number, r: number) => ({ x: Math.cos(frac * Math.PI * 2) * r, z: Math.sin(frac * Math.PI * 2) * r });
  const def = parseTrack(
    {
      id: 'cut', name: 'Cut', theme: 'test', laps: 1, points, sectors: 6, props: [], start: { at: 0 },
      zones: [{ type: 'slick', from: 0.2, to: 0.25, side: 'both' }],
      shortcuts: [{ from: 0.1, to: 0.35, points: [{ ...at(0.18, 70), width: 11 }, { ...at(0.27, 70), width: 11 }] }],
    },
    'cut',
  );
  return buildTrack(def, cfg);
}

/** Does segment p–q cross any wall? (Strict: touching an end does not count.) */
function blocked(track: Track, p: Vec2, q: Vec2): boolean {
  return track.walls.some((w) => {
    const d1 = cross(sub(q, p), sub(w.a, p));
    const d2 = cross(sub(q, p), sub(w.b, p));
    const d3 = cross(sub(w.b, w.a), sub(p, w.a));
    const d4 = cross(sub(w.b, w.a), sub(q, w.a));
    return d1 * d2 < 0 && d3 * d4 < 0;
  });
}

describe('shortcuts', () => {
  const track = circleWithShortcut();
  const br = track.branches[0]!;

  it('builds a shortcut that is shorter than the road it skips and passes the checks', () => {
    expect(track.branches).toHaveLength(1);
    expect(br.length).toBeLessThan((br.to - br.from) * track.length);
    expect(br.samples[0]!.pos.x).toBeCloseTo(track.samples[Math.round(0.1 * track.samples.length)]!.pos.x);
    expect(checkTrack(track, cfg.minWidth).issues).toEqual([]);
  });

  it('opens both junctions: nothing blocks the shortcut or the main road', () => {
    for (let i = 0; i + 1 < br.samples.length; i++) {
      expect(blocked(track, br.samples[i]!.pos, br.samples[i + 1]!.pos)).toBe(false);
    }
    const n = track.samples.length;
    for (let i = 0; i < n; i++) {
      expect(blocked(track, track.samples[i]!.pos, track.samples[(i + 1) % n]!.pos)).toBe(false);
    }
    expect(track.walls.some((w) => w.branch === 0)).toBe(true);
    expect(track.walls.filter((w) => w.junction).length).toBeGreaterThan(0);
  });

  it('maps progress on the shortcut onto the main loop, steadily from start to end', () => {
    // Near the junctions the shortcut still overlaps the main road, which wins there.
    let last = -1;
    let onBranch = 0;
    for (const s of br.samples.slice(1, -1)) {
      const loc = locateOnTrack(track, s.pos, last < 0 ? undefined : Math.floor(last * track.samples.length));
      expect(loc.onTrack).toBe(true);
      expect(loc.progress).toBeGreaterThan(Math.max(last, br.from));
      expect(loc.progress).toBeLessThan(br.to);
      if (loc.branch === 0) {
        onBranch++;
        expect(loc.dir.x * s.dir.x + loc.dir.z * s.dir.z).toBeGreaterThan(0.99);
      }
      last = loc.progress;
    }
    expect(onBranch).toBeGreaterThan(br.samples.length * 0.6);
  });

  it('has no main-road zones on the shortcut', () => {
    const mid = br.samples[Math.floor(br.samples.length / 2)]!;
    const loc = locateOnTrack(track, mid.pos);
    expect(loc.progress).toBeGreaterThan(0.2);
    expect(loc.progress).toBeLessThan(0.25);
    expect(zonesAt(track, loc)).toEqual([]);
  });

  it('keeps main-road locations unchanged, and knows where the roads are', () => {
    const s = track.samples[40]!;
    const loc = locateOnTrack(track, s.pos, 40);
    expect(loc.branch).toBe(-1);
    expect(loc.dir).toEqual(track.samples[loc.segment]!.dir);
    expect(insideRoad(track, s.pos)).toBe(true);
    expect(insideRoad(track, br.samples[10]!.pos)).toBe(true);
    expect(insideRoad(track, { x: 0, z: 0 })).toBe(false);
  });

  it('reports a shortcut that is longer than the road it skips', () => {
    const def = { ...track.def, shortcuts: [{ from: 0.1, to: 0.12, points: [{ x: 60, z: 60, width: 11 }] }] };
    expect(checkTrack(buildTrack(def, cfg), cfg.minWidth).issues.join()).toContain('not shorter');
  });

  it('a car driving the shortcut passes every checkpoint in order and is never wrong-way', () => {
    // Start at the junction, on the main centerline, facing along the shortcut.
    const start = br.samples[0]!;
    const car = createCar('a', { speed: 1, grip: 1, weight: 1 }, track);
    Object.assign(car, { x: start.pos.x, z: start.pos.z, yaw: yawOf(start.dir), segment: Math.round(br.from * track.samples.length) });
    const world = createWorld(track, [car]);
    const run = newRun(['a'], 1, 0);
    const events: SimEvent[] = [];
    let maxWrongWay = 0;
    let usedShortcut = false;
    // The shortcut's centerline, then the main road after it.
    const n = track.samples.length;
    const rejoin = Math.round(br.to * n);
    const path = [...br.samples, ...Array.from({ length: 40 }, (_, k) => track.samples[(rejoin + 1 + k) % n]!)].map((s) => s.pos);
    for (let t = 0; t < 30 / tuning.sim.dt && car.progress < 0.4; t++) {
      // Follow the path 8 samples ahead of the nearest point, at a calm speed.
      let near = 0;
      path.forEach((p, i) => {
        if (distSq(p, car) < distSq(path[near]!, car)) near = i;
      });
      const target = path[Math.min(near + 8, path.length - 1)]!;
      const steer = clamp(-angleDiff(car.yaw, yawOf(sub(target, car))) * 3, -1, 1);
      const gas = length({ x: car.vx, z: car.vz }) < 15;
      events.push(...step(world, { a: { ...NO_INPUT, steer, gas } }, tuning));
      updateWrongWay(run, world, tuning.race);
      maxWrongWay = Math.max(maxWrongWay, run.cars.get('a')!.wrongWayTicks);
      if (locateOnTrack(track, car, car.segment).branch === 0) usedShortcut = true;
    }
    expect(usedShortcut).toBe(true);
    expect(car.progress).toBeGreaterThan(0.35);
    const gates = events.filter((e) => e.type === 'checkpoint').map((e) => (e as { gate: number }).gate);
    expect(gates).toEqual([1, 2]);
    expect(events.some((e) => e.type === 'wallHit')).toBe(false);
    expect(maxWrongWay).toBe(0);
  });
});
