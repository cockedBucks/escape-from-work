import { afterEach, describe, expect, it } from 'vitest';
import { AR, AR_NAMES } from './ar';
import { EN } from './en';
import { lang, nameOf, ordinal, pickLang, setLang, t } from './index';

afterEach(() => setLang('en'));

describe('UI language (P11.4)', () => {
  it('English by default, Arabic when set, placeholders filled', () => {
    expect(lang()).toBe('en');
    expect(t('lobby.car', { n: 3 })).toBe('Car 3');
    setLang('ar');
    expect(t('lobby.car', { n: 3 })).toBe('سيارة 3');
    expect(t('hud.lap', { n: 2, laps: 3 })).toBe('لفة 2/3');
  });

  it('every Arabic string keeps the placeholders and HTML tags of its English one', () => {
    const marks = (s: string): string[] => [...s.matchAll(/\{\w+\}|<\/?[a-z]+/g)].map((m) => m[0]).sort();
    // 'lobby.lap' is always 1 lap: Arabic says "one lap" in words.
    const numberInWords = new Set(['lobby.lap']);
    for (const key of Object.keys(EN) as (keyof typeof EN)[]) {
      if (numberInWords.has(key)) continue;
      expect(marks(AR[key]), key).toEqual(marks(EN[key]));
    }
  });

  it('config names fall back to English', () => {
    expect(nameOf('item.firewall', 'Firewall')).toBe('Firewall');
    setLang('ar');
    expect(nameOf('item.firewall', 'Firewall')).toBe(AR_NAMES['item.firewall']);
    expect(nameOf('item.newThing', 'New Thing')).toBe('New Thing');
  });

  it('auto follows the browser’s first language', () => {
    expect(pickLang('auto', ['ar-EG', 'en'])).toBe('ar');
    expect(pickLang('auto', ['en-US', 'ar'])).toBe('en');
    expect(pickLang('auto', [])).toBe('en');
    expect(pickLang('ar', ['en-US'])).toBe('ar');
    expect(pickLang('en', ['ar'])).toBe('en');
  });

  it('ordinals: 1st/2nd/3rd/11th in English, plain numbers in Arabic', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st']);
    setLang('ar');
    expect(ordinal(2)).toBe('2');
  });
});
