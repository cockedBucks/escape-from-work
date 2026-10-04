/**
 * Small math helpers for the sim. The ground plane is XZ (Y is up), so 2D vectors are
 * `{ x, z }`. Forward for yaw `a` is `(sin a, cos a)`, so a bigger yaw turns the car LEFT
 * (yaw 0 faces +Z, yaw PI/2 faces +X, and the car's right side is -X at yaw 0).
 *
 * Functions return new objects and never mutate their inputs.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export const TAU = Math.PI * 2;
export const EPSILON = 1e-9;

export const vec2 = (x = 0, z = 0): Vec2 => ({ x, z });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, z: a.z * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
/** 2D cross product (Y part of the 3D cross). Positive when `b` points to the left of `a`. */
export const cross = (a: Vec2, b: Vec2): number => a.z * b.x - a.x * b.z;
export const lengthSq = (a: Vec2): number => a.x * a.x + a.z * a.z;
export const length = (a: Vec2): number => Math.sqrt(lengthSq(a));
export const distSq = (a: Vec2, b: Vec2): number => lengthSq(sub(a, b));
export const dist = (a: Vec2, b: Vec2): number => Math.sqrt(distSq(a, b));

/** Unit vector in the same direction, or (0, 0) for a zero-length vector. */
export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len > EPSILON ? { x: a.x / len, z: a.z / len } : { x: 0, z: 0 };
}

/** Forward direction for a yaw angle: `(sin yaw, cos yaw)`. */
export const forward = (yaw: number): Vec2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

/** Right-hand direction for a yaw angle (forward turned a quarter turn clockwise from above). */
export const right = (yaw: number): Vec2 => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });

/** Yaw angle that points along `dir` (inverse of `forward`). */
export const yawOf = (dir: Vec2): number => Math.atan2(dir.x, dir.z);

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: lerp(a.x, b.x, t),
  z: lerp(a.z, b.z, t),
});

/** Move `current` toward `target` by at most `maxDelta`, never overshooting. */
export function moveToward(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a % TAU;
  if (r <= -Math.PI) r += TAU;
  else if (r > Math.PI) r -= TAU;
  return r;
}

/** Shortest signed turn from angle `from` to angle `to`, in (-PI, PI]. */
export const angleDiff = (from: number, to: number): number => wrapAngle(to - from);

/** Wrap a number into [0, 1), for lap progress. */
export function wrap01(v: number): number {
  const r = v - Math.floor(v);
  return r >= 1 ? 0 : r;
}

/** Closest point on segment `a`–`b` to `p`, and how far along the segment it is (0–1). */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const ab = sub(b, a);
  const len2 = lengthSq(ab);
  const t = len2 > EPSILON ? clamp(dot(sub(p, a), ab) / len2, 0, 1) : 0;
  return { point: add(a, scale(ab, t)), t };
}
