import type { TrackZone } from '../config/track';
import { closestOnSegment, distSq, dot, lerp, normalize, sub, wrap01, type Vec2 } from '../util/math';
import type { Track, TrackSample } from './build';

/** Where a point is relative to the track. */
export interface TrackLocation {
  /** Centerline segment index (from sample `segment` to `segment + 1`). */
  segment: number;
  /** Meters from control point 0 along the centerline. */
  dist: number;
  /** `dist / length`, 0–1 (same scale as zones and `start.at`). */
  progress: number;
  /** Signed sideways offset from the centerline (m): positive = right of the driving line. */
  lateral: number;
  /** Half the road width here. */
  halfWidth: number;
  /** Inside the road edges. */
  onTrack: boolean;
}

/**
 * Find the nearest point on the centerline. Pass `hint` (the segment found last tick) so
 * that where the track passes close to itself, the car stays on the part it is driving:
 * nearby segments within a quarter lap of the hint win over farther ones.
 */
export function locateOnTrack(track: Track, p: Vec2, hint?: number): TrackLocation {
  const n = track.samples.length;
  let candidates = track.segmentGrid.queryPoint(p.x, p.z);
  if (candidates.length === 0) candidates = Array.from({ length: n }, (_, i) => i);

  if (hint !== undefined) {
    const window = n / 4;
    const near = candidates.filter((i) => {
      const d = Math.abs(i - hint) % n;
      return Math.min(d, n - d) <= window;
    });
    if (near.length > 0) candidates = near;
  }

  let best = -1;
  let bestD2 = Infinity;
  let bestT = 0;
  let bestPoint: Vec2 = p;
  for (const i of candidates) {
    const a = track.samples[i] as TrackSample;
    const b = track.samples[(i + 1) % n] as TrackSample;
    const { point, t } = closestOnSegment(p, a.pos, b.pos);
    const d2 = distSq(p, point);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
      bestT = t;
      bestPoint = point;
    }
  }

  const a = track.samples[best] as TrackSample;
  const b = track.samples[(best + 1) % n] as TrackSample;
  const d = normalize(sub(b.pos, a.pos));
  const lateral = dot(sub(p, bestPoint), { x: -d.z, z: d.x });
  const halfWidth = lerp(a.width, b.width, bestT) * 0.5;
  const dist = a.dist + bestT * track.spacing;
  return {
    segment: best,
    dist,
    progress: wrap01(dist / track.length),
    lateral,
    halfWidth,
    onTrack: Math.abs(lateral) <= halfWidth,
  };
}

/** Progress since the start line, 0–1 (0 = on the start/finish line). */
export function lapProgress(track: Track, progress: number): number {
  return wrap01(progress - track.def.start.at);
}

/** Ranged zones (ramp, slick, swap) that contain this location. */
export function zonesAt(track: Track, loc: TrackLocation): Extract<TrackZone, { from: number }>[] {
  if (!loc.onTrack) return [];
  return track.rangedZones.filter((z) => {
    if (loc.progress < z.from || loc.progress >= z.to) return false;
    if (z.type === 'ramp' || z.side === 'both') return true;
    return z.side === 'right' ? loc.lateral >= 0 : loc.lateral <= 0;
  });
}
