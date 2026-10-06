import { closestOnSegment, cross, distSq, sub, type Vec2 } from '../util/math';
import { insideOtherRoad, type Track, type TrackSample, type WallSegment } from './build';

export interface TrackStats {
  length: number;
  samples: number;
  minWidth: number;
  maxWidth: number;
  /** Tightest centerline radius (m). */
  minRadius: number;
  /** Per shortcut: its length and the main-loop length it skips (m). */
  branches: { name: string; length: number; skips: number }[];
}

export interface TrackCheck {
  issues: string[];
  stats: TrackStats;
}

/** Strict crossing test: touching at an endpoint does not count. */
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x)) return false;
  if (Math.max(a.z, b.z) < Math.min(c.z, d.z) || Math.max(c.z, d.z) < Math.min(a.z, b.z)) return false;
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

const pct = (track: Track, sample: number): string =>
  `${((sample / track.samples.length) * 100).toFixed(1)}%`;

/**
 * Geometry checks for `npm run track:check`: road wide enough, curves not so tight that
 * the inner wall folds over itself, and no wall crossing another wall of the same road.
 * Shortcuts (branches) must be at least `branchMinWidth` wide, stay off the main road
 * between their junctions, be shorter than the part they skip, and not cut the main walls
 * away from their junctions.
 */
export function checkTrack(track: Track, minWidth: number, branchMinWidth = minWidth): TrackCheck {
  const issues: string[] = [];
  const n = track.samples.length;

  let minW = Infinity;
  let maxW = 0;
  let minRadius = Infinity;
  const roadLimits = (samples: TrackSample[], limit: number, where: (i: number) => string): void => {
    let tooNarrow = -1;
    let tooTight = -1;
    samples.forEach((s, i) => {
      minW = Math.min(minW, s.width);
      maxW = Math.max(maxW, s.width);
      const radius = Math.abs(s.curvature) > 0 ? 1 / Math.abs(s.curvature) : Infinity;
      minRadius = Math.min(minRadius, radius);
      if (s.width < limit && tooNarrow < 0) tooNarrow = i;
      if (radius < s.width * 0.5 && tooTight < 0) tooTight = i;
    });
    if (tooNarrow >= 0) issues.push(`road narrower than ${limit} m at ${where(tooNarrow)}`);
    if (tooTight >= 0) issues.push(`curve tighter than half the road width at ${where(tooTight)} (inner wall folds)`);
  };
  roadLimits(track.samples, minWidth, (i) => `${pct(track, i)} of the lap`);

  const branchStats: TrackStats['branches'] = [];
  track.branches.forEach((b, r) => {
    const m = b.samples.length;
    const name = `shortcut "${b.def.name}"`;
    roadLimits(b.samples, branchMinWidth, (i) => `${name} ${((i / (m - 1)) * 100).toFixed(0)}%`);
    const skips = (b.def.to - b.def.from) * track.length;
    branchStats.push({ name: b.def.name, length: b.length, skips });
    if (b.length >= skips) {
      issues.push(`${name} is ${b.length.toFixed(0)} m, not shorter than the ${skips.toFixed(0)} m it skips`);
    }
    // Between the junctions the shortcut must be its own corridor, not part of the main road.
    const middle = b.samples.slice(Math.floor(m * 0.3), Math.ceil(m * 0.7));
    if (middle.some((s) => insideOtherRoad(track, s.pos, r + 1))) {
      issues.push(`${name} runs over the main road between its junctions`);
    }
  });

  // Every wall segment against every later one, except direct neighbours on the same road
  // and side. Walls of different roads meet at a shortcut's junction corners (both cut at
  // the other road's edge); touching there is fine.
  const CORNER = 0.1; // m
  const touches = (w: WallSegment, o: WallSegment): boolean =>
    [w.a, w.b].some((p) => distSq(p, closestOnSegment(p, o.a, o.b).point) < CORNER * CORNER);
  const where = (w: WallSegment): string =>
    w.road === 0
      ? `${w.side} wall at ${pct(track, w.sample)}`
      : `shortcut "${track.branches[w.road - 1]?.def.name}" ${w.side} wall`;
  const walls = track.walls;
  let crossings = 0;
  let first = '';
  for (let i = 0; i < walls.length; i++) {
    const wi = walls[i] as WallSegment;
    for (let j = i + 1; j < walls.length; j++) {
      const wj = walls[j] as WallSegment;
      if (wi.road === wj.road && wi.side === wj.side) {
        const gap = Math.abs(wi.sample - wj.sample);
        if ((wi.road === 0 ? Math.min(gap, n - gap) : gap) <= 1) continue;
      }
      if (wi.road !== wj.road && (touches(wi, wj) || touches(wj, wi))) continue;
      if (segmentsCross(wi.a, wi.b, wj.a, wj.b)) {
        if (crossings === 0) first = `${where(wi)} crosses ${where(wj)}`;
        crossings++;
      }
    }
  }
  if (crossings > 0) issues.push(`${crossings} wall crossing(s), first: ${first}`);

  return {
    issues,
    stats: { length: track.length, samples: n, minWidth: minW, maxWidth: maxW, minRadius, branches: branchStats },
  };
}
