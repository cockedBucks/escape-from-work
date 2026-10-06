import { cross, sub, type Vec2 } from '../util/math';
import type { Track, TrackSample, WallSegment } from './build';

export interface TrackStats {
  length: number;
  samples: number;
  minWidth: number;
  maxWidth: number;
  /** Tightest centerline radius (m). */
  minRadius: number;
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

/** Where a wall is, for messages: lap % on the main loop, or meters along a shortcut. */
const where = (track: Track, w: WallSegment): string =>
  w.branch === -1
    ? `${w.side} wall at ${pct(track, w.sample)}`
    : `shortcut ${w.branch + 1} ${w.side} wall at ${((track.branches[w.branch]?.spacing ?? 0) * w.sample).toFixed(0)} m`;

/**
 * Geometry checks for `npm run track:check`: road wide enough, curves not so tight that
 * the inner wall folds over itself, and no wall crossing any other wall.
 */
export function checkTrack(track: Track, minWidth: number): TrackCheck {
  const issues: string[] = [];
  const n = track.samples.length;

  let minW = Infinity;
  let maxW = 0;
  let minRadius = Infinity;
  let tooNarrow = -1;
  let tooTight = -1;
  track.samples.forEach((s: TrackSample, i) => {
    minW = Math.min(minW, s.width);
    maxW = Math.max(maxW, s.width);
    const radius = Math.abs(s.curvature) > 0 ? 1 / Math.abs(s.curvature) : Infinity;
    minRadius = Math.min(minRadius, radius);
    if (s.width < minWidth && tooNarrow < 0) tooNarrow = i;
    if (radius < s.width * 0.5 && tooTight < 0) tooTight = i;
  });
  if (tooNarrow >= 0) {
    issues.push(`road narrower than ${minWidth} m at ${pct(track, tooNarrow)} of the lap`);
  }
  if (tooTight >= 0) {
    issues.push(`curve tighter than half the road width at ${pct(track, tooTight)} (inner wall folds)`);
  }
  for (const br of track.branches) {
    const at = (i: number): string => `shortcut ${br.index + 1} at ${(i * br.spacing).toFixed(0)} m`;
    const narrow = br.samples.findIndex((s) => s.width < minWidth);
    if (narrow >= 0) issues.push(`road narrower than ${minWidth} m on ${at(narrow)}`);
    const tight = br.samples.findIndex((s) => Math.abs(s.curvature) > 0 && 1 / Math.abs(s.curvature) < s.width * 0.5);
    if (tight >= 0) issues.push(`curve tighter than half the road width on ${at(tight)} (inner wall folds)`);
    if (br.length >= (br.to - br.from) * track.length) {
      issues.push(`shortcut ${br.index + 1} (${br.length.toFixed(0)} m) is not shorter than the road it skips`);
    }
  }

  // Every wall segment against every later one, except direct neighbours on the same side
  // and the wall ends that meet where a shortcut joins.
  const walls = track.walls;
  let crossings = 0;
  let first = '';
  for (let i = 0; i < walls.length; i++) {
    const wi = walls[i] as WallSegment;
    for (let j = i + 1; j < walls.length; j++) {
      const wj = walls[j] as WallSegment;
      if (wi.side === wj.side && wi.branch === wj.branch) {
        const gap = Math.abs(wi.sample - wj.sample);
        if ((wi.branch === -1 ? Math.min(gap, n - gap) : gap) <= 1) continue;
      }
      if (wi.junction && wj.junction && wi.branch !== wj.branch) continue;
      if (segmentsCross(wi.a, wi.b, wj.a, wj.b)) {
        if (crossings === 0) first = `${where(track, wi)} crosses ${where(track, wj)}`;
        crossings++;
      }
    }
  }
  if (crossings > 0) issues.push(`${crossings} wall crossing(s), first: ${first}`);

  return {
    issues,
    stats: { length: track.length, samples: n, minWidth: minW, maxWidth: maxW, minRadius },
  };
}
