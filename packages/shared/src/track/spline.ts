import { distSq, lerp, type Vec2 } from '../util/math';

/** A control point: position plus road width. */
export interface WidthPoint extends Vec2 {
  width: number;
}

/** One evenly spaced point along the centerline. */
export interface SplineSample {
  pos: Vec2;
  width: number;
}

/** Fine steps per control-point segment before resampling by arc length. */
const FINE_STEPS = 64;

/**
 * Centripetal Catmull-Rom point between p1 and p2 (u in 0–1). "Centripetal" spaces the
 * curve parameter by the square root of the distance between points, which avoids loops and
 * cusps when control points are unevenly spaced (a plain Catmull-Rom can overshoot there).
 */
function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const knot = (a: Vec2, b: Vec2): number => Math.max(Math.sqrt(Math.sqrt(distSq(a, b))), 1e-6);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = lerp(t1, t2, u);
  const mix = (a: Vec2, b: Vec2, ta: number, tb: number): Vec2 => {
    const wa = (tb - t) / (tb - ta);
    const wb = (t - ta) / (tb - ta);
    return { x: a.x * wa + b.x * wb, z: a.z * wa + b.z * wb };
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** Smooth 0–1 ease so widths blend without kinks at control points. */
const smoothstep = (u: number): number => u * u * (3 - 2 * u);

/**
 * Sample a closed Catmull-Rom loop through `points` into evenly spaced samples, about
 * `spacing` meters apart (adjusted so they divide the loop exactly). Sample 0 sits on
 * control point 0. Returns the samples and the loop length.
 */
export function sampleClosedSpline(
  points: readonly WidthPoint[],
  spacing: number,
): { samples: SplineSample[]; length: number } {
  const n = points.length;
  if (n < 4) throw new Error('A closed spline needs at least 4 points');
  const at = (i: number): WidthPoint => points[((i % n) + n) % n] as WidthPoint;

  // 1. Dense polyline with cumulative arc length.
  const fine: SplineSample[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < FINE_STEPS; s++) {
      const u = s / FINE_STEPS;
      fine.push({ pos: catmullRom(p0, p1, p2, p3, u), width: lerp(p1.width, p2.width, smoothstep(u)) });
    }
  }
  fine.push(fine[0] as SplineSample); // close the loop
  const cumulative = [0];
  for (let i = 1; i < fine.length; i++) {
    const d = Math.sqrt(distSq((fine[i - 1] as SplineSample).pos, (fine[i] as SplineSample).pos));
    cumulative.push((cumulative[i - 1] as number) + d);
  }
  const length = cumulative[cumulative.length - 1] as number;

  // 2. Resample at equal arc-length steps.
  const count = Math.max(8, Math.round(length / spacing));
  const step = length / count;
  const samples: SplineSample[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = k * step;
    while ((cumulative[j + 1] as number) < target) j++;
    const d0 = cumulative[j] as number;
    const d1 = cumulative[j + 1] as number;
    const u = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
    const a = fine[j] as SplineSample;
    const b = fine[j + 1] as SplineSample;
    samples.push({
      pos: { x: lerp(a.pos.x, b.pos.x, u), z: lerp(a.pos.z, b.pos.z, u) },
      width: lerp(a.width, b.width, u),
    });
  }
  return { samples, length };
}
