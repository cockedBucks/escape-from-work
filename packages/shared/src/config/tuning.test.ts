import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import { ConfigError, GAME_TITLE, parseTuning } from '../index';

/** A fresh, deep copy of the real config that a test can break. */
function copy(): Record<string, Record<string, unknown>> {
  return JSON.parse(JSON.stringify(realTuning)) as Record<string, Record<string, unknown>>;
}

function errorOf(raw: unknown): ConfigError {
  try {
    parseTuning(raw);
  } catch (err) {
    if (err instanceof ConfigError) return err;
    throw err;
  }
  throw new Error('expected parseTuning to throw');
}

describe('tuning config', () => {
  it('accepts the real config/tuning.json', () => {
    const t = parseTuning(realTuning);
    expect(t.sim.dt).toBeCloseTo(1 / 60, 12);
    expect(t.net.port).toBeGreaterThan(0);
  });

  it('rejects a missing section', () => {
    const raw = copy();
    delete raw['net'];
    expect(errorOf(raw).message).toContain('net');
  });

  it('rejects a wrong type and names the path', () => {
    const raw = copy();
    raw['net']!['port'] = '2567';
    expect(errorOf(raw).message).toContain('net.port');
  });

  it('rejects out-of-range numbers', () => {
    const raw = copy();
    raw['sim']!['dt'] = 0;
    raw['net']!['port'] = 70000;
    const msg = errorOf(raw).message;
    expect(msg).toContain('sim.dt');
    expect(msg).toContain('net.port');
  });

  it('rejects unknown keys so typos are caught', () => {
    const raw = copy();
    raw['net']!['patchRateMS'] = 33;
    expect(errorOf(raw).message).toContain('patchRateMS');
  });

  it('says which file was bad', () => {
    expect(() => parseTuning(null, 'my/file.json')).toThrow(/my\/file\.json/);
  });
});

describe('constants', () => {
  it('has the game title', () => {
    expect(GAME_TITLE).toBe('Escape from Work');
  });
});
