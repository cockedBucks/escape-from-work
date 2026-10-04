import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import { parseTuning } from './tuning';
import { getTuningValue, tuningFields } from './tuningFields';

describe('tuningFields', () => {
  const fields = tuningFields();
  const byPath = (p: string) => fields.find((f) => f.path.join('.') === p);

  it('lists every number in tuning.json with schema limits', () => {
    const t = parseTuning(realTuning);
    for (const f of fields) expect(typeof getTuningValue(t, f.path)).toBe('number');
    expect(byPath('car.topSpeed')).toMatchObject({ min: 0, minExclusive: true, integer: false });
    expect(byPath('car.slickGrip')).toMatchObject({ min: 0, max: 1, minExclusive: false });
    expect(byPath('net.port')).toMatchObject({ min: 1, max: 65535, integer: true });
    expect(byPath('camera.fov')).toMatchObject({ min: 30, max: 110 });
  });

  it('skips non-numbers (enums like quality.default)', () => {
    expect(byPath('quality.default')).toBeUndefined();
    expect(byPath('quality.presets.low.shadows')).toBeUndefined();
    expect(byPath('quality.presets.low.maxDrawCalls')).toBeDefined();
  });

  it('getTuningValue handles missing paths', () => {
    const t = parseTuning(realTuning);
    expect(getTuningValue(t, ['car', 'nope'])).toBeUndefined();
    expect(getTuningValue(t, ['car', 'topSpeed', 'deeper'])).toBeUndefined();
  });
});
