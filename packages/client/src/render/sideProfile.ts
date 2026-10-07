// Side-profile math for the car kit (P12.2): a car's body and cabin are drawn as side
// outlines (points [z, y]: z forward from the car's center, y up from the ground) and then
// extruded across the car. Pure 2D math, no Three.js, for tests.

/** A point of a side outline: [z, y] in meters. */
export type SidePoint = readonly [number, number];

const EPS = 1e-9;

/**
 * The highest point of an outline straight above `z` (−Infinity if it does not reach `z`).
 * `closed`: also use the edge from the last point back to the first (a polygon); off for a
 * top line such as a car body's hood-roof-trunk line.
 */
export function heightAt(points: readonly SidePoint[], z: number, closed = true): number {
  let best = -Infinity;
  const n = points.length;
  const edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i++) {
    const [z0, y0] = points[i]!;
    const [z1, y1] = points[(i + 1) % n]!;
    if (z < Math.min(z0, z1) - EPS || z > Math.max(z0, z1) + EPS) continue;
    const y = Math.abs(z1 - z0) < EPS ? Math.max(y0, y1) : y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
    if (y > best) best = y;
  }
  return best;
}

/** Twice the signed area: > 0 when the points go counter-clockwise (z right, y up). */
export function signedArea2(points: readonly SidePoint[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [z0, y0] = points[i]!;
    const [z1, y1] = points[(i + 1) % points.length]!;
    a += z0 * y1 - z1 * y0;
  }
  return a;
}

/** A convex polygon shrunk by `d` on every side (window glass inside its frame). */
export function insetConvex(points: readonly SidePoint[], d: number): SidePoint[] {
  const n = points.length;
  const sign = signedArea2(points) >= 0 ? 1 : -1;
  // Each edge moved inward: a point on it and its direction.
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % n]!;
    const dz = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dz, dy) || 1;
    // Inward = left of the edge for counter-clockwise points.
    const nz = (-dy / len) * sign;
    const ny = (dz / len) * sign;
    return { z: p[0] + nz * d, y: p[1] + ny * d, dz, dy };
  });
  return lines.map((cur, i) => {
    const prev = lines[(i + n - 1) % n]!;
    const cross = prev.dz * cur.dy - prev.dy * cur.dz;
    if (Math.abs(cross) < EPS) return [cur.z, cur.y] as const;
    const t = ((cur.z - prev.z) * cur.dy - (cur.y - prev.y) * cur.dz) / cross;
    return [prev.z + prev.dz * t, prev.y + prev.dy * t] as const;
  });
}

/** The part of a polygon between `zMin` and `zMax` (one side window out of the whole glass). */
export function clipZ(points: readonly SidePoint[], zMin: number, zMax: number): SidePoint[] {
  const clip = (pts: readonly SidePoint[], keep: (z: number) => boolean, edge: number): SidePoint[] => {
    const out: SidePoint[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[(i + 1) % pts.length]!;
      const pIn = keep(p[0]);
      const qIn = keep(q[0]);
      if (pIn) out.push(p);
      if (pIn !== qIn) {
        const t = (edge - p[0]) / (q[0] - p[0]);
        out.push([edge, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out;
  };
  return clip(clip(points, (z) => z >= zMin, zMin), (z) => z <= zMax, zMax);
}

/** A wheel arch: wheel center along the car and height, and the arch radius. */
export interface Arch {
  z: number;
  centerY: number;
  radius: number;
}

/**
 * A car body's whole side: its top line (front to back) dropped to the `ride` line at both
 * ends, and the bottom edge notched up around each wheel (`segments` per arch).
 */
export function bodySide(top: readonly SidePoint[], ride: number, arches: readonly Arch[], segments: number): SidePoint[] {
  const first = top[0]!;
  const last = top[top.length - 1]!;
  const pts: SidePoint[] = [[first[0], ride], ...top, [last[0], ride]];
  // Along the bottom from the back to the front; each arch goes up and over its wheel.
  for (const a of [...arches].sort((p, q) => p.z - q.z)) {
    const s = (ride - a.centerY) / a.radius;
    if (s >= 1) continue; // the wheel sits below the body: no arch
    const a0 = Math.asin(Math.max(-1, s));
    for (let i = 0; i <= segments; i++) {
      const ang = Math.PI - a0 - ((Math.PI - 2 * a0) * i) / segments;
      pts.push([a.z + a.radius * Math.cos(ang), a.centerY + a.radius * Math.sin(ang)]);
    }
  }
  return pts;
}

/** Where a straight piece goes along the edge p→q: its middle, length and tilt (for a box). */
export function alongEdge(p: SidePoint, q: SidePoint): { z: number; y: number; length: number; tilt: number } {
  const dz = q[0] - p[0];
  const dy = q[1] - p[1];
  // rotateX(tilt) turns a box's +Z axis to point from p to q.
  return { z: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2, length: Math.hypot(dz, dy), tilt: Math.atan2(-dy, dz) };
}

/** The pieces of a top line (front to back) that lie within z ∈ [zMin, zMax]. */
export function topSegments(top: readonly SidePoint[], zMin: number, zMax: number): [SidePoint, SidePoint][] {
  const out: [SidePoint, SidePoint][] = [];
  for (let i = 0; i + 1 < top.length; i++) {
    const p = top[i]!;
    const q = top[i + 1]!;
    const lo = Math.max(Math.min(p[0], q[0]), zMin);
    const hi = Math.min(Math.max(p[0], q[0]), zMax);
    if (hi - lo < EPS) continue;
    const at = (z: number): SidePoint => [z, p[1] + ((q[1] - p[1]) * (z - p[0])) / (q[0] - p[0])];
    out.push(p[0] > q[0] ? [at(hi), at(lo)] : [at(lo), at(hi)]);
  }
  return out;
}
