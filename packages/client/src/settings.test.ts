import { describe, expect, it } from 'vitest';
import realTuning from '../../../config/tuning.json';
import { parseTuning } from '@escape/shared';
import { pickQuality } from './render/renderer';
import { DEFAULT_SETTINGS, parseSettings } from './settings';
import { KEY_HELP } from './ui/roleKeys';

const tuning = parseTuning(realTuning);

describe('settings', () => {
  it('reads saved settings and falls back for anything missing or junk', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ quality: 'low', showFps: true }))).toEqual({ quality: 'low', showFps: true });
    expect(parseSettings(JSON.stringify({ quality: 'ultra', showFps: 'yes' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('quality: the URL wins, then your setting, then the host default', () => {
    expect(pickQuality('?quality=high', tuning, 'low').level).toBe('high');
    expect(pickQuality('', tuning, 'low').level).toBe('low');
    expect(pickQuality('', tuning, 'auto').level).toBe(tuning.quality.default);
  });

  it('the key help names every key the game listens to', () => {
    const text = KEY_HELP.flatMap((g) => g.keys.map(([k]) => k)).join(' ');
    for (const key of ['A', 'D', 'W', 'S', 'Shift', 'Space', 'Q', 'H', 'R', 'C', 'Tab', 'Esc', 'F3', '?']) {
      expect(text, key).toContain(key);
    }
  });
});
