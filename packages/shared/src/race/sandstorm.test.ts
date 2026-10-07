import { describe, expect, it } from 'vitest';
import { parseTrack } from '../config/track';
import { sandstormOn } from './sandstorm';

const storm = { lap: 2, fogNear: 4, fogFar: 40 };

describe('sandstorm (P10.2)', () => {
  it('blows for exactly the leader\'s storm lap, only while racing', () => {
    expect(sandstormOn(storm, 'racing', [0, 0])).toBe(false);
    expect(sandstormOn(storm, 'racing', [1, 0])).toBe(true);
    expect(sandstormOn(storm, 'racing', [2, 1])).toBe(false);
    expect(sandstormOn(storm, 'countdown', [1])).toBe(false);
    expect(sandstormOn(storm, 'results', [1])).toBe(false);
    expect(sandstormOn(undefined, 'racing', [1])).toBe(false);
  });

  it('rejects fog that starts after it ends', () => {
    const base = {
      id: 't', name: 'T', theme: 'oasis', laps: 3, sectors: 2, zones: [], props: [], start: { at: 0 },
      points: [{ x: 0, z: 0, width: 14 }, { x: 50, z: 0, width: 14 }, { x: 50, z: 50, width: 14 }, { x: 0, z: 50, width: 14 }],
    };
    expect(parseTrack({ ...base, sandstorm: storm }, 't').sandstorm).toEqual(storm);
    expect(() => parseTrack({ ...base, sandstorm: { lap: 2, fogNear: 50, fogFar: 40 } }, 't')).toThrow(/fogNear/);
  });
});
