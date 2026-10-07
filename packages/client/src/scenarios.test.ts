import { describe, expect, it } from 'vitest';
import { hashWorld } from '@escape/shared';
import { loadTrack, loadTuning, trackIds } from './content';
import { followAlpha } from './render/cameras';
import { frozenBotRace, isRaceScenario, propHalfWidth, propsShowroom } from './scenarios';

const tuning = loadTuning();

describe('bundled content', () => {
  it('bundles and builds the Test Loop; unknown tracks fail clearly', () => {
    expect(trackIds()).toContain('test-loop');
    expect(loadTrack('test-loop', tuning).samples.length).toBeGreaterThan(100);
    expect(() => loadTrack('nope', tuning)).toThrow(/unknown track "nope"/);
  });
});

describe('scenarios', () => {
  const track = loadTrack('test-loop', tuning);

  it('freezes the same picture every time (screenshots are comparable)', () => {
    expect(hashWorld(frozenBotRace(track, tuning, 'chase'))).toBe(hashWorld(frozenBotRace(track, tuning, 'chase')));
  });

  it('chase is mid-race (cars moving), overview is at the start line', () => {
    const chase = frozenBotRace(track, tuning, 'chase');
    expect(Math.hypot(chase.cars[0]!.vx, chase.cars[0]!.vz)).toBeGreaterThan(10);
    const overview = frozenBotRace(track, tuning, 'track-overview');
    expect(overview.tick).toBe(0);
  });

  it('knows its scenario names', () => {
    expect(isRaceScenario('chase')).toBe(true);
    expect(isRaceScenario('hello')).toBe(false);
    expect(isRaceScenario(null)).toBe(false);
  });
});

describe('camera smoothing', () => {
  it('is frame-rate independent: two half steps = one full step', () => {
    const one = followAlpha(8, 1 / 30);
    const half = followAlpha(8, 1 / 60);
    expect(1 - (1 - half) * (1 - half)).toBeCloseTo(one, 10);
    expect(followAlpha(8, 0)).toBe(0);
  });
});

describe('props showroom (P10.6)', () => {
  it('lines up the kits the track uses, spaced so the big ones do not overlap', () => {
    const oasis = loadTrack('smart-oasis', tuning);
    const { track } = propsShowroom(oasis);
    const kits = track.def.props.map((p) => p.kit);
    expect(new Set(kits)).toEqual(new Set(oasis.def.props.map((p) => p.kit)));
    for (let i = 1; i < track.def.props.length; i++) {
      const a = track.def.props[i - 1]!;
      const b = track.def.props[i]!;
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThanOrEqual(propHalfWidth(a.kit) + propHalfWidth(b.kit));
    }
  });
});
