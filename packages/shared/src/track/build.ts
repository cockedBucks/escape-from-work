import type { TrackBranchDef, TrackDef, TrackZone } from '../config/track';
import type { Tuning } from '../config/tuning';
import { add, closestOnSegment, cross, distSq, dot, lerp, normalize, scale, sub, wrap01, yawOf, type Vec2 } from '../util/math';
import { SpatialGrid } from './grid';
import { sampleClosedSpline, sampleOpenSpline } from './spline';

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
  /** Road it bounds: 0 = main loop, b + 1 = branch b. */
  road: number;
  /** Sample (of that road) this segment starts at. */
  sample: number;
}

/**
 * A shortcut road. Its samples' `dist`/`progress` are mapped onto the main loop (linear
 * from `def.from` to `def.to`), so everything that reads progress works on it unchanged.
 */
export interface TrackBranch {
  def: TrackBranchDef;
  /** Open polyline: segment k runs from sample k to k + 1 (no wrap). Ends sit on the main centerline. */
  samples: TrackSample[];
  /** Real driving length (m), to compare with the main loop between from and to. */
  length: number;
  /** Id of this branch's segment 0 in `segmentGrid` (main segments are 0..n-1). */
  segBase: number;
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
  /** Shortcuts (may be empty). */
  branches: TrackBranch[];
  /**
   * Centerline segment ids: main segment `i` runs from sample `i` to `i + 1` (wrapping);
   * ids from `branch.segBase` are that branch's segments.
   */
  segmentGrid: SpatialGrid;
  wallGrid: SpatialGrid;
}

export type TrackBuildConfig = Tuning['track'];

/** Turn a validated track file into geometry the sim can query. Pure and deterministic. */
export function buildTrack(def: TrackDef, cfg: TrackBuildConfig): Track {
  const { samples: raw, length } = sampleClosedSpline(def.points, cfg.sampleSpacing);
  const n = raw.length;
  const spacing = length / n;
  const pos = (i: number): Vec2 => (raw[((i % n) + n) % n] as (typeof raw)[number]).pos;

  const dirs = raw.map((_, i) => normalize(sub(pos(i + 1), pos(i - 1))));
  const samples: TrackSample[] = raw.map((s, i) => {
    const dir = dirs[i] as Vec2;
    const prev = dirs[(i - 1 + n) % n] as Vec2;
    const next = dirs[(i + 1) % n] as Vec2;
    // Turn angle across two sample steps; positive = left (bigger yaw).
    const turn = Math.atan2(cross(prev, next), dot(prev, next));
    return {
      pos: s.pos,
      dir,
      right: { x: -dir.z, z: dir.x },
      width: s.width,
      dist: i * spacing,
      progress: i / n,
      curvature: turn / (2 * spacing),
    };
  });

  const sample = (i: number): TrackSample => samples[((i % n) + n) % n] as TrackSample;

  const branches = def.branches.map((b) => buildBranch(b, samples, length, cfg.sampleSpacing));
  let segBase = n;
  for (const b of branches) {
    b.segBase = segBase;
    segBase += b.samples.length - 1;
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
      left: edge(s, 'left'),
      right: edge(s, 'right'),
    });
  }

  const segmentGrid = new SpatialGrid(cfg.gridCellSize);
  const insertSegment = (id: number, a: TrackSample, b: TrackSample): void => {
    // Cover the whole road around the segment plus one cell, so points a bit off the
    // road still find their segment.
    const pad = Math.max(a.width, b.width) * 0.5 + cfg.gridCellSize;
    segmentGrid.insert(
      id,
      Math.min(a.pos.x, b.pos.x) - pad,
      Math.min(a.pos.z, b.pos.z) - pad,
      Math.max(a.pos.x, b.pos.x) + pad,
      Math.max(a.pos.z, b.pos.z) + pad,
    );
  };
  for (let i = 0; i < n; i++) insertSegment(i, sample(i), sample(i + 1));
  for (const b of branches) {
    for (let k = 0; k < b.samples.length - 1; k++) {
      insertSegment(b.segBase + k, b.samples[k] as TrackSample, b.samples[k + 1] as TrackSample);
    }
  }

  // Walls along every road. Where two roads overlap (a shortcut's junctions), a wall piece
  // with both ends inside the other road is left out, which opens the junction.
  const partial = { samples, branches, segmentGrid };
  const walls: WallSegment[] = [];
  const roads: { samples: TrackSample[]; closed: boolean }[] = [
    { samples, closed: true },
    ...branches.map((b) => ({ samples: b.samples, closed: false })),
  ];
  roads.forEach((r, road) => {
    const m = r.samples.length;
    const count = r.closed ? m : m - 1;
    for (const side of ['left', 'right'] as const) {
      for (let i = 0; i < count; i++) {
        const sa = r.samples[i] as TrackSample;
        const sb = r.samples[(i + 1) % m] as TrackSample;
        let a = edge(sa, side);
        let b = edge(sb, side);
        if (branches.length > 0) {
          const inA = insideOtherRoad(partial, a, road);
          const inB = insideOtherRoad(partial, b, road);
          if (inA && inB) continue;
          // Straddles the other road's edge: cut it there, so the two roads' walls meet at
          // the junction corner instead of poking into the other road.
          if (inA) a = roadEdgeBetween(partial, b, a, road);
          if (inB) b = roadEdgeBetween(partial, a, b, road);
        }
        const d = normalize(sub(b, a));
        let normal: Vec2 = { x: -d.z, z: d.x };
        const mid = scale(add(sa.pos, sb.pos), 0.5);
        if (dot(normal, sub(mid, a)) < 0) normal = scale(normal, -1);
        walls.push({ a, b, normal, side, road, sample: i });
      }
    }
  });

  const wallGrid = new SpatialGrid(cfg.gridCellSize);
  walls.forEach((w, i) => {
    wallGrid.insert(i, Math.min(w.a.x, w.b.x), Math.min(w.a.z, w.b.z), Math.max(w.a.x, w.b.x), Math.max(w.a.z, w.b.z));
  });

  const rangedZones = def.zones.filter((z): z is Extract<TrackZone, { from: number }> => 'from' in z);

  return { def, length, spacing, samples, walls, gates, rangedZones, branches, segmentGrid, wallGrid };
}

/** Road edge point beside a sample. */
function edge(s: TrackSample, side: 'left' | 'right'): Vec2 {
  return add(s.pos, scale(s.right, (side === 'right' ? 1 : -1) * s.width * 0.5));
}

/** Samples along a branch: from the main centerline at `from`, through its points, to `to`. */
function buildBranch(def: TrackBranchDef, main: TrackSample[], mainLength: number, spacing: number): TrackBranch {
  const n = main.length;
  const at = (p: number): TrackSample => main[Math.round(p * n) % n] as TrackSample;
  const s0 = at(def.from);
  const s1 = at(def.to);
  const first = def.points[0] as TrackBranchDef['points'][number];
  const last = def.points[def.points.length - 1] as TrackBranchDef['points'][number];
  // Phantom points along the main direction make the branch leave and rejoin tangentially.
  const lead = Math.sqrt(distSq(s0.pos, first));
  const tail = Math.sqrt(distSq(s1.pos, last));
  const ctrl = [
    { ...sub(s0.pos, scale(s0.dir, lead)), width: first.width },
    { ...s0.pos, width: first.width },
    ...def.points,
    { ...s1.pos, width: last.width },
    { ...add(s1.pos, scale(s1.dir, tail)), width: last.width },
  ];
  const { samples: raw, length } = sampleOpenSpline(ctrl, spacing);
  const m = raw.length;
  const pos = (i: number): Vec2 => (raw[Math.min(Math.max(i, 0), m - 1)] as (typeof raw)[number]).pos;
  const dirs = raw.map((_, i) => normalize(sub(pos(i + 1), pos(i - 1))));
  const step = length / (m - 1);
  const samples = raw.map((r, i): TrackSample => {
    const dir = dirs[i] as Vec2;
    const prev = dirs[Math.max(i - 1, 0)] as Vec2;
    const next = dirs[Math.min(i + 1, m - 1)] as Vec2;
    const turn = Math.atan2(cross(prev, next), dot(prev, next));
    const progress = lerp(def.from, def.to, i / (m - 1));
    return {
      pos: r.pos,
      dir,
      right: { x: -dir.z, z: dir.x },
      width: r.width,
      dist: progress * mainLength,
      progress,
      curvature: turn / (2 * step),
    };
  });
  return { def, samples, length, segBase: 0 };
}

/** Where the segment from `outside` to `inside` enters another road (bisection, ~1 mm). */
function roadEdgeBetween(track: RoadLookup, outside: Vec2, inside: Vec2, road: number): Vec2 {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (insideOtherRoad(track, { x: lerp(outside.x, inside.x, mid), z: lerp(outside.z, inside.z, mid) }, road)) hi = mid;
    else lo = mid;
  }
  return { x: lerp(outside.x, inside.x, lo), z: lerp(outside.z, inside.z, lo) };
}

/** What `insideOtherRoad` needs (the track while it is being built). */
type RoadLookup = Pick<Track, 'samples' | 'branches' | 'segmentGrid'>;

/** Segment id → its road (0 = main, b + 1 = branch b), local segment and end samples. */
export function segmentOf(track: RoadLookup, id: number): { road: number; local: number; a: TrackSample; b: TrackSample } {
  const n = track.samples.length;
  if (id < n) {
    return { road: 0, local: id, a: track.samples[id] as TrackSample, b: track.samples[(id + 1) % n] as TrackSample };
  }
  for (let r = 0; r < track.branches.length; r++) {
    const br = track.branches[r] as TrackBranch;
    const local = id - br.segBase;
    if (local >= 0 && local < br.samples.length - 1) {
      return { road: r + 1, local, a: br.samples[local] as TrackSample, b: br.samples[local + 1] as TrackSample };
    }
  }
  throw new Error(`segmentOf: no segment ${id}`);
}

/**
 * Is `p` on the surface of a road other than `road` (a little inside its edge)? A branch's
 * rounded ends do not count: past its end points it is not a road.
 */
export function insideOtherRoad(track: RoadLookup, p: Vec2, road: number): boolean {
  const EDGE = 0.05; // m inside the edge, so a shared edge point does not count
  for (const id of track.segmentGrid.queryPoint(p.x, p.z)) {
    const seg = segmentOf(track, id);
    if (seg.road === road) continue;
    const { point, t } = closestOnSegment(p, seg.a.pos, seg.b.pos);
    if (seg.road > 0) {
      const br = track.branches[seg.road - 1] as TrackBranch;
      if ((seg.local === 0 && t <= 0) || (seg.local === br.samples.length - 2 && t >= 1)) continue;
    }
    const half = lerp(seg.a.width, seg.b.width, t) * 0.5 - EDGE;
    if (distSq(p, point) < half * half) return true;
  }
  return false;
}

/** Wall segments whose bounding cells touch a circle (broad phase for collisions). */
export function wallsNear(track: Track, p: Vec2, radius: number): WallSegment[] {
  return track.wallGrid
    .queryBox(p.x - radius, p.z - radius, p.x + radius, p.z + radius)
    .map((i) => track.walls[i] as WallSegment);
}
