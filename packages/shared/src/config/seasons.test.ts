import { describe, expect, it } from 'vitest';
import realSeasons from '../../../../config/seasons.json';
import { activeSeason, parseSeasons, seasonOn, type Season } from './seasons';

const season = (dates: { from: string; to: string }[]): Season => ({ id: 's', name: 'S', dates, kits: ['pumpkin'], snow: false });

describe('seasons config (P11.3)', () => {
  it('accepts the real config/seasons.json', () => {
    const cfg = parseSeasons(realSeasons);
    expect(cfg.seasons.length).toBeGreaterThanOrEqual(1);
  });

  it('a yearly range, also across the new year', () => {
    const halloween = season([{ from: '10-20', to: '11-02' }]);
    expect(seasonOn(halloween, '2026-10-19')).toBe(false);
    expect(seasonOn(halloween, '2026-10-20')).toBe(true);
    expect(seasonOn(halloween, '2031-11-02')).toBe(true);
    const winter = season([{ from: '12-15', to: '01-07' }]);
    expect(seasonOn(winter, '2026-12-31')).toBe(true);
    expect(seasonOn(winter, '2027-01-07')).toBe(true);
    expect(seasonOn(winter, '2027-01-08')).toBe(false);
    expect(seasonOn(winter, '2027-06-01')).toBe(false);
  });

  it('a dated range is that year only', () => {
    const ramadan = season([{ from: '2027-02-07', to: '2027-03-08' }]);
    expect(seasonOn(ramadan, '2027-02-20')).toBe(true);
    expect(seasonOn(ramadan, '2028-02-20')).toBe(false);
  });

  it('picks the first season on (config order)', () => {
    const cfg = parseSeasons(realSeasons);
    expect(activeSeason(cfg, '2026-12-25')?.id).toBe('winter');
    expect(activeSeason(cfg, '2026-10-31')?.id).toBe('halloween');
    expect(activeSeason(cfg, '2027-02-20')?.id).toBe('ramadan');
    expect(activeSeason(cfg, '2026-08-01')).toBeNull();
  });

  it('rejects bad dates, mixed forms and duplicate ids', () => {
    const base = JSON.parse(JSON.stringify(realSeasons)) as { seasons: { id: string; dates: { from: string; to: string }[] }[] };
    const bad = (mutate: (c: typeof base) => void): string => {
      const c = JSON.parse(JSON.stringify(base)) as typeof base;
      mutate(c);
      try {
        parseSeasons(c);
      } catch (err) {
        return (err as Error).message;
      }
      return 'ok';
    };
    expect(bad((c) => (c.seasons[0]!.dates = [{ from: '13-01', to: '01-02' }]))).toMatch(/MM-DD/);
    expect(bad((c) => (c.seasons[0]!.dates = [{ from: '2027-01-01', to: '01-02' }]))).toMatch(/both/);
    expect(bad((c) => (c.seasons[0]!.dates = [{ from: '2027-03-01', to: '2027-01-02' }]))).toMatch(/before/);
    expect(bad((c) => (c.seasons[1]!.id = c.seasons[0]!.id))).toMatch(/unique/);
  });
});
