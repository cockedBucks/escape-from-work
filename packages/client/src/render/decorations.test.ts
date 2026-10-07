import { describe, expect, it } from 'vitest';
import { loadSeasons, loadTrack, loadTuning } from '../content';
import { Snowfall, decorationsFor, localDay, pickSeason } from './decorations';
import { SNOW } from './look';

const seasons = loadSeasons();

describe('season pick (P11.3)', () => {
  it('auto follows the date, a season id forces it, off is off', () => {
    expect(pickSeason(seasons, 'auto', '2026-12-24')?.id).toBe('winter');
    expect(pickSeason(seasons, 'auto', '2026-08-01')).toBeNull();
    expect(pickSeason(seasons, 'halloween', '2026-08-01')?.id).toBe('halloween');
    expect(pickSeason(seasons, 'off', '2026-12-24')).toBeNull();
    expect(pickSeason(seasons, 'gone-season', '2026-12-24')?.id).toBe('winter'); // unknown id = auto
  });

  it('local day format', () => {
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('winter brings snow, no season brings nothing', () => {
    const track = loadTrack('office', loadTuning());
    expect(decorationsFor(track, seasons, pickSeason(seasons, 'winter', '2026-08-01'))?.snow).toBe(true);
    expect(decorationsFor(track, seasons, null)).toBeUndefined();
  });

  it('snow falls and stays around the camera', () => {
    const snow = new Snowfall('reduced');
    for (let i = 0; i < 120; i++) snow.update(1 / 60, 500, -300);
    const pos = snow.points.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(Math.abs(pos.getX(i) - 500)).toBeLessThanOrEqual(SNOW.halfSize);
      expect(Math.abs(pos.getZ(i) + 300)).toBeLessThanOrEqual(SNOW.halfSize);
      expect(pos.getY(i)).toBeGreaterThanOrEqual(0);
      expect(pos.getY(i)).toBeLessThanOrEqual(SNOW.height);
    }
    snow.dispose();
  });
});
