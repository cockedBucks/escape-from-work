import { describe, expect, it } from 'vitest';
import { ENGINES } from '@escape/shared';
import { countdownCue } from './cues';
import { ENGINE_VOICES, engineTone, squealing } from './engine';
import { COUNTDOWN_SOUNDS, IMPACT_SOUNDS, impactLevel } from './horn';
import { DEFAULT_VOLUMES, parseVolumes } from './mixer';
import { LOOP_STEPS, loopNotes, midiHz } from './music';

describe('engine voices (P7.7)', () => {
  it('every engine named in the car schema has a voice', () => {
    for (const e of ENGINES) expect(ENGINE_VOICES[e]).toBeDefined();
  });

  it('cars sound different: the pickup is lower than the mini', () => {
    const truck = engineTone(0.5, true, false, ENGINE_VOICES.rumble).hz;
    const mini = engineTone(0.5, true, false, ENGINE_VOICES.whine).hz;
    expect(mini).toBeGreaterThan(truck * 2);
  });

  it('putt-putt engines wobble faster at speed', () => {
    const v = ENGINE_VOICES.putt;
    expect(engineTone(1, true, false, v).tremoloHz).toBeGreaterThan(engineTone(0, true, false, v).tremoloHz);
  });

  it('tires squeal while drifting, or braking hard at speed (not crawling)', () => {
    expect(squealing(true, false, 0.1)).toBe(true);
    expect(squealing(false, true, 0.8)).toBe(true);
    expect(squealing(false, true, 0.1)).toBe(false);
    expect(squealing(false, false, 0.9)).toBe(false);
  });
});

describe('impacts and countdown', () => {
  it('soft scrapes are silent; harder hits are louder, up to full', () => {
    expect(impactLevel(1)).toBe(0);
    expect(impactLevel(5)).toBeGreaterThan(0);
    expect(impactLevel(15)).toBeGreaterThan(impactLevel(5));
    expect(impactLevel(100)).toBe(1);
    for (const p of Object.values(IMPACT_SOUNDS)) expect(p.gain).toBeLessThanOrEqual(0.5);
  });

  it('beeps when the countdown number changes, "go" at the start banner, nothing otherwise', () => {
    expect(countdownCue(null, '3')).toBe('beep');
    expect(countdownCue('3', '3')).toBe(null);
    expect(countdownCue('3', '2')).toBe('beep');
    expect(countdownCue('1', 'CLOCK OUT!')).toBe('go');
    expect(countdownCue('CLOCK OUT!', null)).toBe(null);
    expect(COUNTDOWN_SOUNDS.go.duration).toBeGreaterThan(COUNTDOWN_SOUNDS.beep.duration);
  });
});

describe('volumes', () => {
  it('reads saved levels, clamps them, and falls back to defaults for junk', () => {
    expect(parseVolumes(null)).toEqual(DEFAULT_VOLUMES);
    expect(parseVolumes('not json')).toEqual(DEFAULT_VOLUMES);
    const v = parseVolumes(JSON.stringify({ master: 0.3, engine: 7, sfx: 'x', music: -1 }));
    expect(v).toEqual({ master: 0.3, engine: 1, sfx: DEFAULT_VOLUMES.sfx, music: 0 });
  });
});

describe('menu loop', () => {
  it('has a lead note on every step and a bass note twice a bar, and loops', () => {
    for (let s = 0; s < LOOP_STEPS; s++) {
      const notes = loopNotes(s);
      expect(notes.filter((n) => n.voice === 'lead')).toHaveLength(1);
      expect(notes.filter((n) => n.voice === 'bass').length).toBe(s % 4 === 0 ? 1 : 0);
    }
    expect(loopNotes(LOOP_STEPS + 3)).toEqual(loopNotes(3));
    expect(midiHz(69)).toBe(440);
  });
});
