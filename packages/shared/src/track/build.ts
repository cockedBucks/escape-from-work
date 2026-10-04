import type { TrackDef, TrackZone } from '../config/track';
import type { Tuning } from '../config/tuning';
import { add, cross, dot, normalize, scale, sub, wrap01, yawOf, type Vec2 } from '../util/math';
import { SpatialGrid } from './grid';
import { sampleClosedSpline } from './spline';

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
  /** Centerline sample this segment starts at. */
  sample: number;
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
  /** Centerline segment `i` runs from sample `i` to sample `i + 1` (wrapping). */
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
  const edge = (i: number, side: 'left' | 'right'): Vec2 => {
    const s = sample(i);
    return add(s.pos, scale(s.right, (side === 'right' ? 1 : -1) * s.width * 0.5));
  };

  const walls: WallSegment[] = [];
  for (const side of ['left', 'right'] as const) {
    for (let i = 0; i < n; i++) {
      const a = edge(i, side);
      const b = edge(i + 1, side);
      const d = normalize(sub(b, a));
      let normal: Vec2 = { x: -d.z, z: d.x };
      const mid = scale(add(sample(i).pos, sample(i + 1).pos), 0.5);
      if (dot(normal, sub(mid, a)) < 0) normal = scale(normal, -1);
      walls.push({ a, b, normal, side, sample: i });
    }
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

  const segmentGrid = new SpatialGrid(cfg.gridCellSize);
  for (let i = 0; i < n; i++) {
    const a = sample(i);
    const b = sample(i + 1);
    // Cover the whole road around the segment plus one cell, so points a bit off the
    // road still find their segment.
    const pad = Math.max(a.width, b.width) * 0.5 + cfg.gridCellSize;
    segmentGrid.insert(
      i,
      Math.min(a.pos.x, b.pos.x) - pad,
      Math.min(a.pos.z, b.pos.z) - pad,
      Math.max(a.pos.x, b.pos.x) + pad,
      Math.max(a.pos.z, b.pos.z) + pad,
    );
  }

  const wallGrid = new SpatialGrid(cfg.gridCellSize);
  walls.forEach((w, i) => {
    wallGrid.insert(i, Math.min(w.a.x, w.b.x), Math.min(w.a.z, w.b.z), Math.max(w.a.x, w.b.x), Math.max(w.a.z, w.b.z));
  });

  const rangedZones = def.zones.filter((z): z is Extract<TrackZone, { from: number }> => 'from' in z);

  return { def, length, spacing, samples, walls, gates, rangedZones, segmentGrid, wallGrid };
}

/** Wall segments whose bounding cells touch a circle (broad phase for collisions). */
export function wallsNear(track: Track, p: Vec2, radius: number): WallSegment[] {
  return track.wallGrid
    .queryBox(p.x - radius, p.z - radius, p.x + radius, p.z + radius)
    .map((i) => track.walls[i] as WallSegment);
}
