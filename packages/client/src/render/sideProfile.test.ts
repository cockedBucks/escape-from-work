import { describe, expect, it } from 'vitest';
import { alongEdge, bodySide, clipZ, heightAt, insetConvex, signedArea2, topSegments, type SidePoint } from './sideProfile';

// A 2 m long, 1 m tall box (counter-clockwise: z right, y up).
const box: SidePoint[] = [[1, 0], [1, 1], [-1, 1], [-1, 0]];

describe('side profile math (P12.2)', () => {
  it('heightAt finds the top of an outline, open or closed', () => {
    expect(heightAt(box, 0)).toBeCloseTo(1, 9);
    expect(heightAt(box, 1)).toBeCloseTo(1, 9); // an upright edge counts at its top
    expect(heightAt(box, 2)).toBe(-Infinity);
    const line: SidePoint[] = [[2, 0.5], [0, 1], [-2, 0.5]];
    expect(heightAt(line, 1, false)).toBeCloseTo(0.75, 9);
    expect(heightAt(line, -1, false)).toBeCloseTo(0.75, 9);
  });

  it('insetConvex shrinks a polygon evenly, either winding', () => {
    expect(signedArea2(box)).toBeGreaterThan(0);
    const inner = insetConvex(box, 0.1);
    expect(inner.map(([z, y]) => [+z.toFixed(6), +y.toFixed(6)])).toEqual([[0.9, 0.1], [0.9, 0.9], [-0.9, 0.9], [-0.9, 0.1]]);
    const cw = [...box].reverse();
    expect(signedArea2(cw)).toBeLessThan(0);
    for (const [z, y] of insetConvex(cw, 0.1)) {
      expect(Math.abs(z)).toBeCloseTo(0.9, 6);
      expect(y === 0 ? 0 : Math.min(y, 1 - y)).toBeCloseTo(0.1, 6);
    }
  });

  it('clipZ cuts a window out of the glass between two z values', () => {
    const tri: SidePoint[] = [[1, 0], [-1, 1], [-1, 0]];
    const pane = clipZ(tri, -0.5, 0.5);
    const zs = pane.map((p) => p[0]);
    expect(Math.min(...zs)).toBeCloseTo(-0.5, 9);
    expect(Math.max(...zs)).toBeCloseTo(0.5, 9);
    expect(heightAt(pane, 0)).toBeCloseTo(0.5, 9);
    expect(clipZ(tri, 2, 3)).toEqual([]);
  });

  it('bodySide drops the top line to the ride line and arches up over each wheel', () => {
    const top: SidePoint[] = [[2, 0.8], [-2, 0.8]];
    const side = bodySide(top, 0.3, [{ z: 1.2, centerY: 0.35, radius: 0.4 }, { z: -1.2, centerY: 0.35, radius: 0.4 }], 6);
    expect(side.slice(0, 4)).toEqual([[2, 0.3], [2, 0.8], [-2, 0.8], [-2, 0.3]]);
    expect(side.length).toBe(4 + 2 * 7);
    // Every arch point is the arch radius from the wheel center, and the arch peaks over it.
    const rear = side.slice(4, 11);
    for (const [z, y] of rear) expect(Math.hypot(z + 1.2, y - 0.35)).toBeCloseTo(0.4, 9);
    expect(Math.max(...rear.map((p) => p[1]))).toBeCloseTo(0.35 + 0.4 * Math.sin(Math.PI / 2 - 0), 1);
    expect(rear[0]![1]).toBeCloseTo(0.3, 9);
    expect(rear[6]![1]).toBeCloseTo(0.3, 9);
    // Back to front along the bottom.
    expect(side[4]![0]).toBeLessThan(side[10]![0]);
    expect(side[11]![0]).toBeGreaterThan(0);
  });

  it('alongEdge tilts a box to lie from p to q', () => {
    const e = alongEdge([1, 0], [0, 1]);
    expect(e.length).toBeCloseTo(Math.SQRT2, 9);
    expect([e.z, e.y]).toEqual([0.5, 0.5]);
    // rotateX(tilt) maps +Z (0, 0, 1) to (0, −sin, cos) = the direction p→q in (z, y).
    expect(Math.cos(e.tilt)).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(-Math.sin(e.tilt)).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it('topSegments keeps the pieces of a line inside a z range', () => {
    const line: SidePoint[] = [[2, 0.5], [0, 1], [-2, 1]];
    const hood = topSegments(line, 1, Infinity);
    expect(hood).toHaveLength(1);
    expect(hood[0]![0]).toEqual([2, 0.5]);
    expect(hood[0]![1][0]).toBeCloseTo(1, 9);
    expect(hood[0]![1][1]).toBeCloseTo(0.75, 9);
    expect(topSegments(line, -Infinity, -1)).toEqual([[[-1, 1], [-2, 1]]]);
  });
});
