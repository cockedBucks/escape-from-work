import { describe, expect, it } from 'vitest';
import { gaugeText, kmh } from './gauges';

describe('gauges', () => {
  it('shows speed in km/h and empty slots until heat/nitro/items exist', () => {
    expect(kmh(10)).toBe(36);
    expect(kmh(-5)).toBe(18);
    expect(gaugeText({ speed: 27.8, lap: 'LAP 2/3', place: '1st / 4', heat: null, stalled: false, nitro: null, item: null })).toEqual({
      speed: '100', lap: 'LAP 2/3', place: '1st / 4', heatLabel: 'HEAT', heat: 0, nitro: 0, item: '—',
    });
  });

  it('heat bar: rounded to small steps, and says STALL! while stalled', () => {
    const t = gaugeText({ speed: 0, lap: null, place: null, heat: 0.733, stalled: false, nitro: null, item: null });
    expect(t.heat).toBeCloseTo(0.74, 6);
    expect(gaugeText({ speed: 0, lap: null, place: null, heat: 1, stalled: true, nitro: null, item: null }).heatLabel).toBe('STALL!');
  });
});
