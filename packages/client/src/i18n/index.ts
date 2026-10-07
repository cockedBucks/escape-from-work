// UI language (P11.4): English or Arabic. Picked once at page load (Settings → Language, or the
// browser's language on Auto); changing it reloads the page. Arabic turns the page right-to-left.
import { AR, AR_NAMES } from './ar';
import { EN, type StringKey } from './en';

export type { StringKey } from './en';
export type Lang = 'en' | 'ar';
export const LANG_SETTINGS = ['auto', 'en', 'ar'] as const;
export type LangSetting = (typeof LANG_SETTINGS)[number];
/** How each language names itself (the picker shows these in any language). */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', ar: 'العربية' };

let current: Lang = 'en';

/** Use `l` from now on, and set the page's `lang` and text direction. */
export function setLang(l: Lang): void {
  current = l;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  }
}

export const lang = (): Lang => current;

/** The string for `key` in the current language, with `{name}` placeholders filled from `vars`. */
export function t(key: StringKey, vars?: Readonly<Record<string, string | number>>): string {
  const s: string = (current === 'ar' ? AR[key] : undefined) ?? EN[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** A name from a config file (`item.<id>`, `track.<id>`, `season.<id>`, `award.<id>.title`…) in the current language; `fallback` (the config's English) when there is none. */
export function nameOf(key: string, fallback: string): string {
  return current === 'ar' ? (AR_NAMES[key] ?? fallback) : fallback;
}

/** The language for a setting: 'en' / 'ar', or on 'auto' the browser's first language. */
export function pickLang(setting: string, browser: readonly string[]): Lang {
  if (setting === 'en' || setting === 'ar') return setting;
  return (browser[0] ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/** 1 → "1st" in English; Arabic says "place {n}" around a plain number. */
export function ordinal(n: number): string {
  if (current === 'ar') return String(n);
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}
