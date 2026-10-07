import { describe, expect, it } from 'vitest';
import realTuning from '../../../config/tuning.json';
import { parseTuning } from '@escape/shared';
import { pickQuality } from './render/renderer';
import { DEFAULT_SETTINGS, parseSettings } from './settings';
import { keyHelp } from './ui/roleKeys';

const tuning = parseTuning(realTuning);

describe('settings', () => {
  it('reads saved settings and falls back for anything missing or junk', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ quality: 'low', showFps: true }))).toEqual({ quality: 'low', showFps: true, decor: 'auto', lang: 'auto' });
    expect(parseSettings(JSON.stringify({ lang: 'ar' })).lang).toBe('ar');
    expect(parseSettings(JSON.stringify({ lang: 'klingon' })).lang).toBe('auto');
    expect(parseSettings(JSON.stringify({ decor: 'winter' })).decor).toBe('winter');
    expect(parseSettings(JSON.stringify({ decor: '<b>' })).decor).toBe('auto');
    expect(parseSettings(JSON.stringify({ quality: 'ultra', showFps: 'yes' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('quality: the URL wins, then your setting, then the host default', () => {
    expect(pickQuality('?quality=high', tuning, 'low').level).toBe('high');
    expect(pickQuality('', tuning, 'low').level).toBe('low');
    expect(pickQuality('', tuning, 'auto').level).toBe(tuning.quality.default);
  });

  it('the key help names every key the game listens to', () => {
    const text = keyHelp().flatMap((g) => g.keys.map(([k]) => k)).join(' ');
    for (const key of ['A', 'D', 'W', 'S', 'Shift', 'Space', 'Q', 'H', 'R', 'C', 'Tab', 'Esc', 'F3', '?']) {
      expect(text, key).toContain(key);
    }
  });
});

describe('the help key', () => {
  const key = (k: string, code = '', repeat = false) => ({ key: k, code, repeat });
  it('"?" (also the Arabic ؟) or F1 opens the keys, again closes them; held keys do nothing', async () => {
    const { helpKeyAction } = await import('./ui/settingsScreen');
    expect(helpKeyAction(key('?', 'Slash'), false, false)).toBe('openKeys');
    expect(helpKeyAction(key('؟', 'Slash'), false, false)).toBe('openKeys');
    expect(helpKeyAction(key('F1', 'F1'), false, false)).toBe('openKeys');
    expect(helpKeyAction(key('?', 'Slash'), true, true)).toBe('close');
    expect(helpKeyAction(key('?', 'Slash'), true, false)).toBe('openKeys'); // settings tab open: switch to keys
    expect(helpKeyAction(key('?', 'Slash', true), false, false)).toBe(null);
    expect(helpKeyAction(key('Escape', 'Escape'), true, false)).toBe('close');
    expect(helpKeyAction(key('Escape', 'Escape'), false, false)).toBe(null); // the lobby gets it
  });
});
