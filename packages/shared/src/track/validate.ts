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

  // Every wall segment against every later one, except direct neighbours on the same side.
  const walls = track.walls;
  let crossings = 0;
  let first = '';
  for (let i = 0; i < walls.length; i++) {
    const wi = walls[i] as WallSegment;
    for (let j = i + 1; j < walls.length; j++) {
      const wj = walls[j] as WallSegment;
      if (wi.side === wj.side) {
        const gap = Math.abs(wi.sample - wj.sample);
        if (Math.min(gap, n - gap) <= 1) continue;
      }
      if (segmentsCross(wi.a, wi.b, wj.a, wj.b)) {
        if (crossings === 0) {
          first = `${wi.side} wall at ${pct(track, wi.sample)} crosses ${wj.side} wall at ${pct(track, wj.sample)}`;
        }
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
