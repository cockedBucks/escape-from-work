import type { TrackDef, TrackShortcut, TrackZone } from '../config/track';
import type { Tuning } from '../config/tuning';
import { add, closestOnSegment, cross, dist, distSq, dot, lerp, normalize, scale, sub, wrap01, yawOf, type Vec2 } from '../util/math';
import { SpatialGrid } from './grid';
import { sampleClosedSpline, sampleOpenSpline, type SplineSample } from './spline';

/** One evenly spaced centerline point. */
export interface TrackSample {
  pos: Vec2;
  /** Unit direction of travel. */
  dir: Vec2;
  /** Unit vector to the driver's right. */
  right: Vec2;
  width: number;
  /** Meters from control point 0 along the centerline. */
  dist: number;
  /** `dist / length`, 0–1. Zones and `start.at` use this. */
  progress: number;
  /** Signed curvature (1/m): positive turns left. Radius = 1 / |curvature|. */
  curvature: number;
}

export interface WallSegment {
  a: Vec2;
  b: Vec2;
  /** Unit normal pointing from the wall toward the road. */
  normal: Vec2;
  side: 'left' | 'right';
  /** Centerline sample this segment starts at (on its own centerline). */
  sample: number;
  /** -1 = main loop, else the shortcut index. */
  branch: number;
  /** Next to a gap where a shortcut joins: may touch the other road's wall there. */
  junction: boolean;
}

/** A shortcut: an open centerline that leaves the main loop and rejoins it later. */
export interface TrackBranch {
  index: number;
  /** Main-loop progress where it leaves and rejoins (snapped to main samples; `to` may be 1). */
  from: number;
  to: number;
  /** `dist` = meters along the shortcut; `progress` = the main-loop progress it maps to. */
  samples: TrackSample[];
  length: number;
  spacing: number;
  /** Segment `i` runs from sample `i` to sample `i + 1` (no wrap). */
  segmentGrid: SpatialGrid;
}

/** A sector gate (checkpoint) across the road. Gate 0 is the start/finish line. */
export interface SectorGate {
  index: number;
  progress: number;
  sample: number;
  pos: Vec2;
  /** Facing direction of travel, for respawning. */
  yaw: number;
  left: Vec2;
  right: Vec2;
}

export interface Track {
  def: TrackDef;
  length: number;
  /** Distance between samples (m). */
  spacing: number;
  samples: TrackSample[];
  walls: WallSegment[];
  gates: SectorGate[];
  /** Zones with a progress range (ramp, slick, swap), in file order. */
  rangedZones: Extract<TrackZone, { from: number }>[];
  /** Shortcuts, in file order. Their walls are in `walls` too. */
  branches: TrackBranch[];
  /** Centerline segment `i` runs from sample `i` to sample `i + 1` (wrapping). */
  segmentGrid: SpatialGrid;
  wallGrid: SpatialGrid;
}

export type TrackBuildConfig = Tuning['track'];

/**
 * Samples (direction, right vector, curvature) along a centerline. A closed one wraps at the
 * ends; an open one (a shortcut) clamps there. `progressOf(i)` gives each sample's progress.
 */
function centerline(raw: SplineSample[], spacing: number, closed: boolean, progressOf: (i: number) => number): TrackSample[] {
  const n = raw.length;
  const idx = (i: number): number => (closed ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1));
  const pos = (i: number): Vec2 => (raw[idx(i)] as SplineSample).pos;
  const dirs = raw.map((_, i) => normalize(sub(pos(i + 1), pos(i - 1))));
  return raw.map((s, i) => {
    const dir = dirs[i] as Vec2;
    const prev = dirs[idx(i - 1)] as Vec2;
    const next = dirs[idx(i + 1)] as Vec2;
    // Turn angle across two sample steps (fewer at an open end); positive = left (bigger yaw).
    const steps = idx(i + 1) - idx(i - 1);
    const turn = Math.atan2(cross(prev, next), dot(prev, next));
    return {
      pos: s.pos,
      dir,
      right: { x: -dir.z, z: dir.x },
      width: s.width,
      dist: i * spacing,
      progress: progressOf(i),
      curvature: closed ? turn / (2 * spacing) : steps > 0 ? turn / (steps * spacing) : 0,
    };
  });
}

/** Wall segments along both road edges: `count` segments from sample i to i + 1. */
function edgeWalls(samples: TrackSample[], count: number, branch: number): WallSegment[] {
  const n = samples.length;
  const sample = (i: number): TrackSample => samples[((i % n) + n) % n] as TrackSample;
  const edge = (i: number, side: 'left' | 'right'): Vec2 => {
    const s = sample(i);
    return add(s.pos, scale(s.right, (side === 'right' ? 1 : -1) * s.width * 0.5));
  };
  const walls: WallSegment[] = [];
  for (const side of ['left', 'right'] as const) {
    for (let i = 0; i < count; i++) {
      const a = edge(i, side);
      const b = edge(i + 1, side);
      const d = normalize(sub(b, a));
      let normal: Vec2 = { x: -d.z, z: d.x };
      const mid = scale(add(sample(i).pos, sample(i + 1).pos), 0.5);
      if (dot(normal, sub(mid, a)) < 0) normal = scale(normal, -1);
      walls.push({ a, b, normal, side, sample: i, branch, junction: false });
    }
  }
  return walls;
}

/** Grid of centerline segments, each padded by the road and one cell. */
function segmentGridOf(samples: TrackSample[], count: number, cellSize: number): SpatialGrid {
  const n = samples.length;
  const grid = new SpatialGrid(cellSize);
  for (let i = 0; i < count; i++) {
    const a = samples[i] as TrackSample;
    const b = samples[(i + 1) % n] as TrackSample;
    // Cover the whole road around the segment plus one cell, so points a bit off the
    // road still find their segment.
    const pad = Math.max(a.width, b.width) * 0.5 + cellSize;
    grid.insert(
      i,
      Math.min(a.pos.x, b.pos.x) - pad,
      Math.min(a.pos.z, b.pos.z) - pad,
      Math.max(a.pos.x, b.pos.x) + pad,
      Math.max(a.pos.z, b.pos.z) + pad,
    );
  }
  return grid;
}

/** A shortcut from its file entry: junctions on the main centerline, shaped by `points`. */
function buildBranch(index: number, cut: TrackShortcut, main: TrackSample[], cfg: TrackBuildConfig): TrackBranch {
  const n = main.length;
  const i0 = Math.round(cut.from * n);
  const i1 = Math.round(cut.to * n);
  const a = main[i0 % n] as TrackSample;
  const b = main[i1 % n] as TrackSample;
  const first = cut.points[0]!;
  const last = cut.points[cut.points.length - 1]!;
  const points = [{ ...a.pos, width: first.width }, ...cut.points, { ...b.pos, width: last.width }];
  // Phantom ends along the main road, so the shortcut leaves and rejoins it smoothly.
  const before = sub(a.pos, scale(a.dir, Math.max(dist(a.pos, first), 1)));
  const after = add(b.pos, scale(b.dir, Math.max(dist(b.pos, last), 1)));
  const { samples: raw, length } = sampleOpenSpline(points, before, after, cfg.sampleSpacing);
  const from = i0 / n;
  const to = i1 / n;
  const last1 = raw.length - 1;
  const spacing = length / last1;
  const samples = centerline(raw, spacing, false, (i) => wrap01(lerp(from, to, i / last1)));
  return { index, from, to, samples, length, spacing, segmentGrid: segmentGridOf(samples, last1, cfg.gridCellSize) };
}

/** Is `p` inside the road around this centerline (by more than `margin`)? */
function insideCenterline(samples: TrackSample[], grid: SpatialGrid, p: Vec2, margin: number): boolean {
  const n = samples.length;
  for (const i of grid.queryPoint(p.x, p.z)) {
    const a = samples[i] as TrackSample;
    const b = samples[(i + 1) % n] as TrackSample;
    const { point, t } = closestOnSegment(p, a.pos, b.pos);
    const half = lerp(a.width, b.width, t) * 0.5 - margin;
    if (half > 0 && distSq(p, point) < half * half) return true;
  }
  return false;
}

/** How far inside the other road a wall's middle must be before that wall is dropped (m). */
const UNION_MARGIN = 0.05;

/** A wall within this many samples of a dropped one is part of a junction. */
const JUNCTION_SAMPLES = 2;

/**
 * Merge main and shortcut walls into the outline of the joined roads: a wall whose middle
 * lies inside the other road is dropped, which opens the junctions.
 */
function unionWalls(main: TrackSample[], mainGrid: SpatialGrid, mainWalls: WallSegment[], branches: TrackBranch[], branchWalls: WallSegment[]): WallSegment[] {
  const inside = (p: Vec2, own: number): boolean =>
    (own !== -1 && insideCenterline(main, mainGrid, p, UNION_MARGIN)) ||
    branches.some((br) => br.index !== own && insideCenterline(br.samples, br.segmentGrid, p, UNION_MARGIN));
  const all = [...mainWalls, ...branchWalls];
  const keep = all.map((w) => !inside(scale(add(w.a, w.b), 0.5), w.branch));
  const dropped = new Set<string>();
  const key = (w: WallSegment, sample: number): string => `${w.branch}:${w.side}:${sample}`;
  all.forEach((w, i) => {
    if (!keep[i]) dropped.add(key(w, w.sample));
  });
  const n = main.length;
  return all.filter((w, i) => {
    if (!keep[i]) return false;
    for (let k = -JUNCTION_SAMPLES; k <= JUNCTION_SAMPLES; k++) {
      const s = w.branch === -1 ? (((w.sample + k) % n) + n) % n : w.sample + k;
      if (dropped.has(key(w, s))) w.junction = true;
    }
    return true;
  });
}

/** Turn a validated track file into geometry the sim can query. Pure and deterministic. */
export function buildTrack(def: TrackDef, cfg: TrackBuildConfig): Track {
  const { samples: raw, length } = sampleClosedSpline(def.points, cfg.sampleSpacing);
  const n = raw.length;
  const spacing = length / n;
  const samples = centerline(raw, spacing, true, (i) => i / n);
  const sample = (i: number): TrackSample => samples[((i % n) + n) % n] as TrackSample;
  const edge = (i: number, side: 'left' | 'right'): Vec2 => {
    const s = sample(i);
    return add(s.pos, scale(s.right, (side === 'right' ? 1 : -1) * s.width * 0.5));
  };

  const segmentGrid = segmentGridOf(samples, n, cfg.gridCellSize);
  const branches = def.shortcuts.map((cut, i) => buildBranch(i, cut, samples, cfg));
  let walls = edgeWalls(samples, n, -1);
  if (branches.length > 0) {
    const branchWalls = branches.flatMap((br) => edgeWalls(br.samples, br.samples.length - 1, br.index));
    walls = unionWalls(samples, segmentGrid, walls, branches, branchWalls);
  }

  const gates: SectorGate[] = [];
  for (let k = 0; k < def.sectors; k++) {
    const progress = wrap01(def.start.at + k / def.sectors);
    const idx = Math.round(progress * n) % n;
    const s = sample(idx);
    gates.push({
      index: k,
      progress: s.progress,
      sample: idx,
      pos: s.pos,
      yaw: yawOf(s.dir),
      left: edge(idx, 'left'),
      right: edge(idx, 'right'),
    });
  }

  const wallGrid = new SpatialGrid(cfg.gridCellSize);
  walls.forEach((w, i) => {
    wallGrid.insert(i, Math.min(w.a.x, w.b.x), Math.min(w.a.z, w.b.z), Math.max(w.a.x, w.b.x), Math.max(w.a.z, w.b.z));
  });

  const rangedZones = def.zones.filter((z): z is Extract<TrackZone, { from: number }> => 'from' in z);

  return { def, length, spacing, samples, walls, gates, rangedZones, branches, segmentGrid, wallGrid };
}

/** Wall segments whose bounding cells touch a circle (broad phase for collisions). */
export function wallsNear(track: Track, p: Vec2, radius: number): WallSegment[] {
  return track.wallGrid
    .queryBox(p.x - radius, p.z - radius, p.x + radius, p.z + radius)
    .map((i) => track.walls[i] as WallSegment);
}

/** Is `p` on any road (main loop or a shortcut)? Visual helpers use it to keep the road clear. */
export function insideRoad(track: Track, p: Vec2, margin = 0): boolean {
  return (
    insideCenterline(track.samples, track.segmentGrid, p, margin) ||
    track.branches.some((br) => insideCenterline(br.samples, br.segmentGrid, p, margin))
  );
}
