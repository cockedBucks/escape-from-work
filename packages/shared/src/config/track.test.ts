import { describe, expect, it } from 'vitest';
import { parseTrack } from './track';

/** A small valid track: a square loop with one of each zone type. */
function sample(): Record<string, unknown> {
  return {
    id: 'sample',
    name: 'Sample Loop',
    theme: 'test',
    laps: 3,
    points: [
      { x: 0, z: 0, width: 14 },
      { x: 60, z: 0, width: 14 },
      { x: 60, z: 60, width: 12 },
      { x: 0, z: 60, width: 12 },
    ],
    sectors: 4,
    zones: [
      { type: 'ramp', from: 0.3, to: 0.32, launch: 1 },
      { type: 'slick', from: 0.5, to: 0.55, side: 'both' },
      { type: 'swap', from: 0.8, to: 0.86, side: 'right', minLap: 2 },
      { type: 'itemRow', at: 0.2, count: 4 },
    ],
    props: [{ kit: 'desk', x: 30, z: 30, rot: 1.57 }],
    start: { at: 0 },
  };
}

const msgOf = (raw: unknown): string => {
  try {
    parseTrack(raw, 'sample.json');
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected parseTrack to throw');
};

describe('track schema', () => {
  it('accepts a valid track with every zone type', () => {
    const t = parseTrack(sample(), 'sample.json');
    expect(t.zones.map((z) => z.type)).toEqual(['ramp', 'slick', 'swap', 'itemRow']);
  });

  it('needs at least 4 points for a closed spline', () => {
    const raw = sample();
    raw['points'] = (raw['points'] as unknown[]).slice(0, 3);
    expect(msgOf(raw)).toContain('points');
  });

  it('rejects an unknown zone type and a zone that runs backwards', () => {
    // Separate tracks: the from/to check only runs once the basic shape is valid.
    const unknown = sample();
    unknown['zones'] = [{ type: 'lava', from: 0.1, to: 0.2 }];
    expect(msgOf(unknown)).toContain('zones[0]');
    const backwards = sample();
    backwards['zones'] = [
      { type: 'ramp', from: 0.1, to: 0.2, launch: 1 },
      { type: 'slick', from: 0.6, to: 0.4, side: 'left' },
    ];
    expect(msgOf(backwards)).toContain('zones[1].to');
  });

  it('rejects progress outside 0–1, a zero width and typos', () => {
    const raw = sample();
    raw['start'] = { at: 1.5 };
    (raw['points'] as Record<string, unknown>[])[0]!['width'] = 0;
    raw['lapz'] = 3;
    const msg = msgOf(raw);
    expect(msg).toContain('start.at');
    expect(msg).toContain('points[0].width');
    expect(msg).toContain('lapz');
    expect(msg).toContain('sample.json');
  });
});
