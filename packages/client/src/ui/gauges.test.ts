import { describe, expect, it } from 'vitest';
import { gaugeText, kmh } from './gauges';

describe('gauges', () => {
  it('shows speed in km/h and empty slots until heat/nitro/items exist', () => {
    expect(kmh(10)).toBe(36);
    expect(kmh(-5)).toBe(18);
    expect(gaugeText({ speed: 27.8, lap: 'LAP 2/3', place: '1st / 4', heat: null, nitro: null, item: null })).toEqual({
      speed: '100', lap: 'LAP 2/3', place: '1st / 4', heat: 0, nitro: 0, item: '—',
    });
  });
});
