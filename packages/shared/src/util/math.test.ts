import { describe, expect, it } from 'vitest';
import {
  angleDiff,
  closestOnSegment,
  cross,
  dot,
  forward,
  length,
  moveToward,
  normalize,
  right,
  vec2,
  wrap01,
  wrapAngle,
  yawOf,
} from './math';

describe('math helpers', () => {
  it('forward follows the (sin a, cos a) convention', () => {
    expect(forward(0).x).toBeCloseTo(0);
    expect(forward(0).z).toBeCloseTo(1);
    expect(forward(Math.PI / 2).x).toBeCloseTo(1);
    expect(forward(Math.PI / 2).z).toBeCloseTo(0);
  });

  it('right is perpendicular to forward and on the right side', () => {
    for (const yaw of [0, 0.7, -2, 3]) {
      expect(dot(forward(yaw), right(yaw))).toBeCloseTo(0);
      // A bigger yaw turns left, so "right" is where a smaller yaw points.
      expect(cross(forward(yaw), right(yaw))).toBeLessThan(0);
      expect(cross(forward(yaw), forward(yaw + 0.1))).toBeGreaterThan(0);
    }
  });

  it('yawOf inverts forward', () => {
    for (const yaw of [0, 1, -1, 2.5, -3]) expect(yawOf(forward(yaw))).toBeCloseTo(yaw);
  });

  it('normalize gives unit length and handles zero', () => {
    expect(length(normalize(vec2(3, 4)))).toBeCloseTo(1);
    expect(normalize(vec2(0, 0))).toEqual({ x: 0, z: 0 });
  });

  it('moveToward never overshoots', () => {
    expect(moveToward(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(moveToward(0.9, 1, 0.3)).toBe(1);
    expect(moveToward(0, -1, 0.5)).toBeCloseTo(-0.5);
  });

  it('wrapAngle and angleDiff take the short way round', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(angleDiff(-3, 3)).toBeCloseTo(6 - 2 * Math.PI);
  });

  it('wrap01 wraps lap progress into [0, 1)', () => {
    expect(wrap01(1.25)).toBeCloseTo(0.25);
    expect(wrap01(-0.25)).toBeCloseTo(0.75);
    expect(wrap01(1)).toBe(0);
  });

  it('closestOnSegment clamps to the ends', () => {
    const a = vec2(0, 0);
    const b = vec2(10, 0);
    expect(closestOnSegment(vec2(5, 3), a, b)).toEqual({ point: { x: 5, z: 0 }, t: 0.5 });
    expect(closestOnSegment(vec2(-4, 1), a, b).t).toBe(0);
    expect(closestOnSegment(vec2(14, 1), a, b).point).toEqual({ x: 10, z: 0 });
    expect(closestOnSegment(vec2(1, 1), a, a).t).toBe(0);
  });
});
