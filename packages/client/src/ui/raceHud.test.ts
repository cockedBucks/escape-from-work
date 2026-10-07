import { describe, expect, it } from 'vitest';
import { hudText, ordinal, type HudInput } from './raceHud';

const dt = 1 / 60;
const base = (over: Partial<HudInput> = {}): HudInput => ({
  phase: 'racing', tick: 1000, phaseTick: 0, dt, countdownSeconds: 3, laps: 3, cars: 4,
  me: { lapsDone: 0, place: 2, finished: false, dnf: false, wrongWay: false }, ...over,
});

describe('race HUD text', () => {
  it('counts 3, 2, 1 then shows CLOCK OUT! for a second', () => {
    expect(hudText(base({ phase: 'countdown', tick: 0 })).countdown).toBe('3');
    expect(hudText(base({ phase: 'countdown', tick: 70 })).countdown).toBe('2');
    expect(hudText(base({ phase: 'countdown', tick: 170 })).countdown).toBe('1');
    expect(hudText(base({ phase: 'racing', tick: 10 })).countdown).toBe('CLOCK OUT!');
    expect(hudText(base({ phase: 'racing', tick: 120 })).countdown).toBeNull();
  });

  it('shows lap and place while racing, a banner when done', () => {
    expect(hudText(base())).toMatchObject({ lap: 'LAP 1/3', place: '2nd / 4', banner: null });
    expect(hudText(base({ me: { lapsDone: 2, place: 1, finished: false, dnf: false, wrongWay: false } })).lap).toBe('LAP 3/3');
    const done = hudText(base({ me: { lapsDone: 3, place: 1, finished: true, dnf: false, wrongWay: false } }));
    expect(done).toMatchObject({ lap: null, banner: 'FINISHED 1st!' });
    expect(hudText(base({ me: { lapsDone: 1, place: 4, finished: false, dnf: true, wrongWay: false } })).banner).toMatch(/DNF/);
  });

  it('warns about driving the wrong way only while racing', () => {
    const wrong = { lapsDone: 0, place: 1, finished: false, dnf: false, wrongWay: true };
    expect(hudText(base({ me: wrong })).wrongWay).toBe(true);
    expect(hudText(base({ phase: 'results', me: wrong })).wrongWay).toBe(false);
  });

  it('nothing race-related in the lobby or while watching', () => {
    expect(hudText(base({ phase: 'lobby' }))).toEqual({ countdown: null, lap: null, place: null, banner: null, wrongWay: false });
    expect(hudText(base({ me: null })).lap).toBeNull();
  });

  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

describe('race HUD in a battle (P11.6)', () => {
  it('lives instead of laps, OUT when knocked out, never wrong way', () => {
    const live = hudText(base({ mode: 'battle', me: { lapsDone: 0, place: 1, finished: false, dnf: false, wrongWay: true, lives: 2, out: false } }));
    expect(live.lap).toBe('LIVES ❤❤');
    expect(live.place).toBe('1st / 4');
    expect(live.wrongWay).toBe(false);
    const out = hudText(base({ mode: 'battle', me: { lapsDone: 0, place: 4, finished: false, dnf: false, wrongWay: false, lives: 0, out: true } }));
    expect(out.lap).toBeNull();
    expect(out.banner).toMatch(/OUT/);
  });
});
