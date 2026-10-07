import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import { parseTrack, type TrackDef } from '../config/track';
import { parseTuning } from '../config/tuning';
import { add, dist, dot, length, scale, sub, type Vec2 } from '../util/math';
import { buildTrack, wallsNear } from './build';
import { SpatialGrid } from './grid';
import { lapProgress, locateOnTrack, zonesAt } from './locate';
import { sampleClosedSpline } from './spline';
import { checkTrack } from './validate';

const cfg = parseTuning(realTuning).track;

/** Track through `count` points on a circle, going from +X toward +Z: yaw decreases, so the car turns RIGHT. */
function circleDef(radius: number, width: number, extra: Partial<TrackDef> = {}): TrackDef {
  const count = 12;
  const points = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: Math.cos(a) * radius, z: Math.sin(a) * radius, width };
  });
  return parseTrack(
    { id: 'circle', name: 'Circle', theme: 'test', laps: 1, points, sectors: 4, zones: [], props: [], start: { at: 0 }, ...extra },
    'circle',
  );
}

describe('spline sampling', () => {
  it('samples a circle evenly, starting on point 0', () => {
    const def = circleDef(50, 12);
    const { samples, length: len } = sampleClosedSpline(def.points, 2);
    expect(len).toBeGreaterThan(2 * Math.PI * 50 * 0.99);
    expect(len).toBeLessThan(2 * Math.PI * 50 * 1.01);
    expect(samples[0]!.pos.x).toBeCloseTo(50);
    expect(samples[0]!.pos.z).toBeCloseTo(0);
    for (let i = 0; i < samples.length; i++) {
      const a = samples[i]!.pos;
      const b = samples[(i + 1) % samples.length]!.pos;
      expect(dist(a, b)).toBeCloseTo(len / samples.length, 1);
      expect(Math.abs(length(a) - 50)).toBeLessThan(0.5);
    }
  });

  it('blends widths between control points', () => {
    const points = [
      { x: 0, z: 0, width: 10 },
      { x: 100, z: 0, width: 20 },
      { x: 100, z: 100, width: 20 },
      { x: 0, z: 100, width: 10 },
    ];
    const { samples } = sampleClosedSpline(points, 2);
    for (const s of samples) {
      expect(s.width).toBeGreaterThanOrEqual(10);
      expect(s.width).toBeLessThanOrEqual(20);
    }
  });
});

describe('buildTrack', () => {
  const track = buildTrack(circleDef(50, 12), cfg);

  it('builds left and right walls half a road width from the centerline', () => {
    const n = track.samples.length;
    expect(track.walls.length).toBe(2 * n);
    for (const w of track.walls) {
      const s = track.samples[w.sample]!;
      expect(dist(w.a, s.pos)).toBeCloseTo(6, 5);
    }
    // The car turns right, so the right wall is the inside one.
    const right = track.walls.filter((w) => w.side === 'right');
    for (const w of right) expect(length(w.a)).toBeLessThan(50);
  });

  it('points every wall normal toward the road', () => {
    for (const w of track.walls) {
      const s = track.samples[w.sample]!;
      expect(dot(w.normal, sub(s.pos, w.a))).toBeGreaterThan(0);
      expect(length(w.normal)).toBeCloseTo(1);
    }
  });

  it('measures curvature: the circle turns right (negative) at radius ~R', () => {
    for (const s of track.samples) {
      expect(s.curvature).toBeLessThan(0);
      // A spline through 12 points is a little tighter at each point (~43-55 m), not a perfect circle.
      expect(-1 / s.curvature).toBeGreaterThan(40);
      expect(-1 / s.curvature).toBeLessThan(60);
    }
  });

  it('places sector gates evenly from the start line, facing forward', () => {
    const t = buildTrack(circleDef(50, 12, { start: { at: 0.1 } }), cfg);
    expect(t.gates.map((g) => g.index)).toEqual([0, 1, 2, 3]);
    expect(t.gates[0]!.progress).toBeCloseTo(0.1, 2);
    expect(t.gates[1]!.progress).toBeCloseTo(0.35, 2);
    for (const g of t.gates) {
      const s = t.samples[g.sample]!;
      expect(Math.sin(g.yaw)).toBeCloseTo(s.dir.x, 5);
      expect(Math.cos(g.yaw)).toBeCloseTo(s.dir.z, 5);
      expect(dist(g.left, g.right)).toBeCloseTo(12, 5);
    }
  });

  it('finds the nearby walls through the grid', () => {
    const near = wallsNear(track, { x: 55, z: 0 }, 3);
    expect(near.length).toBeGreaterThan(0);
    expect(near.some((w) => w.side === 'left' && Math.abs(w.a.z) < 5)).toBe(true);
    expect(near.every((w) => w.side === 'left')).toBe(true);
  });
});

describe('locateOnTrack', () => {
  const track = buildTrack(circleDef(50, 12), cfg);

  it('gives progress along the loop and zero offset on the centerline', () => {
    let last = -1;
    for (let i = 0; i < track.samples.length; i += 7) {
      const loc = locateOnTrack(track, track.samples[i]!.pos);
      expect(Math.abs(loc.lateral)).toBeLessThan(1e-6);
      expect(loc.progress).toBeCloseTo(track.samples[i]!.progress, 6);
      expect(loc.progress).toBeGreaterThan(last);
      last = loc.progress;
    }
  });

  it('measures sideways offset: positive on the right, off track past the edge', () => {
    const s = track.samples[20]!;
    const right = locateOnTrack(track, add(s.pos, scale(s.right, 4)));
    expect(right.lateral).toBeCloseTo(4, 1);
    expect(right.onTrack).toBe(true);
    const left = locateOnTrack(track, add(s.pos, scale(s.right, -4)));
    expect(left.lateral).toBeCloseTo(-4, 1);
    const off = locateOnTrack(track, add(s.pos, scale(s.right, 8)));
    expect(off.onTrack).toBe(false);
    expect(off.halfWidth).toBeCloseTo(6);
  });

  it('still works far from the track (no grid cell)', () => {
    const loc = locateOnTrack(track, { x: 500, z: 0 });
    expect(loc.onTrack).toBe(false);
    expect(loc.progress).toBeLessThan(0.05);
  });

  it('uses the hint where the track passes close to itself', () => {
    // A paperclip: two long straights 20 m apart.
    const clip = buildTrack(
      parseTrack(
        {
          id: 'clip', name: 'Clip', theme: 'test', laps: 1, sectors: 2, zones: [], props: [], start: { at: 0 },
          points: [
            { x: 0, z: 0, width: 8 }, { x: 100, z: 0, width: 8 }, { x: 100, z: 20, width: 8 }, { x: 0, z: 20, width: 8 },
          ],
        },
        'clip',
      ),
      cfg,
    );
    const p: Vec2 = { x: 50, z: 11 }; // slightly nearer the top straight
    const free = locateOnTrack(clip, p);
    expect(clip.samples[free.segment]!.pos.z).toBeGreaterThan(10);
    const bottomSeg = locateOnTrack(clip, { x: 50, z: 0 }).segment;
    const hinted = locateOnTrack(clip, p, bottomSeg);
    expect(clip.samples[hinted.segment]!.pos.z).toBeLessThan(10);
  });

  it('lapProgress counts from the start line', () => {
    const t = buildTrack(circleDef(50, 12, { start: { at: 0.9 } }), cfg);
    expect(lapProgress(t, 0.95)).toBeCloseTo(0.05);
    expect(lapProgress(t, 0.1)).toBeCloseTo(0.2);
  });
});

describe('zonesAt', () => {
  const track = buildTrack(
    circleDef(50, 12, {
      zones: [
        { type: 'ramp', from: 0.1, to: 0.12, launch: 1, look: 'wood' },
        { type: 'slick', from: 0.3, to: 0.4, side: 'right', look: 'coffee' },
      ],
    }),
    cfg,
  );
  const at = (progress: number, lateral: number): string[] => {
    const s = track.samples[Math.round(progress * track.samples.length)]!;
    return zonesAt(track, locateOnTrack(track, add(s.pos, scale(s.right, lateral)))).map((z) => z.type);
  };

  it('finds ramps across the full width', () => {
    expect(at(0.11, -4)).toEqual(['ramp']);
    expect(at(0.11, 4)).toEqual(['ramp']);
    expect(at(0.2, 0)).toEqual([]);
  });

  it('respects the slick side and ignores off-track points', () => {
    expect(at(0.35, 3)).toEqual(['slick']);
    expect(at(0.35, -3)).toEqual([]);
    expect(at(0.35, 9)).toEqual([]);
  });
});

describe('SpatialGrid', () => {
  it('returns unique sorted ids, including negative coordinates', () => {
    const g = new SpatialGrid(10);
    g.insert(5, -25, -25, 5, 5);
    g.insert(2, 0, 0, 30, 30);
    g.insert(9, 100, 100, 101, 101);
    expect(g.queryPoint(1, 1)).toEqual([2, 5]);
    expect(g.queryPoint(-21, -3)).toEqual([5]);
    expect(g.queryBox(-30, -30, 200, 200)).toEqual([2, 5, 9]);
    expect(g.queryPoint(60, 60)).toEqual([]);
  });
});

describe('checkTrack', () => {
  it('passes a clean circle', () => {
    expect(checkTrack(buildTrack(circleDef(50, 12), cfg), cfg.minWidth).issues).toEqual([]);
  });

  it('flags a road that is too narrow', () => {
    const issues = checkTrack(buildTrack(circleDef(50, 6), cfg), cfg.minWidth).issues;
    expect(issues.join()).toContain('narrower');
  });

  it('flags a curve so tight the inner wall folds', () => {
    const issues = checkTrack(buildTrack(circleDef(8, 20), cfg), cfg.minWidth).issues;
    expect(issues.join()).toContain('tighter');
  });

  it('flags walls that cross (figure eight)', () => {
    const eight = parseTrack(
      {
        id: 'eight', name: 'Eight', theme: 'test', laps: 1, sectors: 2, zones: [], props: [], start: { at: 0 },
        points: [
          { x: 0, z: 0, width: 12 }, { x: 60, z: 60, width: 12 }, { x: 120, z: 0, width: 12 },
          { x: 60, z: -60, width: 12 }, { x: 0, z: 0.5, width: 12 }, { x: -60, z: 60, width: 12 },
          { x: -120, z: 0, width: 12 }, { x: -60, z: -60, width: 12 },
        ],
      },
      'eight',
    );
    const issues = checkTrack(buildTrack(eight, cfg), cfg.minWidth).issues;
    expect(issues.join()).toContain('wall crossing');
  });
});

describe('Test Loop (config/tracks/test-loop.json)', () => {
  const def = parseTrack(testLoopJson, 'config/tracks/test-loop.json');
  const track = buildTrack(def, cfg);

  it('passes the geometry checks', () => {
    expect(checkTrack(track, cfg.minWidth).issues).toEqual([]);
  });

  it('has a hairpin, a ramp and a slick, and a sensible length', () => {
    const { stats } = checkTrack(track, cfg.minWidth);
    expect(stats.minRadius).toBeLessThan(20);
    expect(def.zones.some((z) => z.type === 'ramp')).toBe(true);
    expect(def.zones.some((z) => z.type === 'slick')).toBe(true);
    expect(track.length).toBeGreaterThan(700);
    expect(track.length).toBeLessThan(1200);
  });
});
