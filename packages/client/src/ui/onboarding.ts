// First-time help (P8.3), once per browser: the role card during your first countdown, and a
// hint the first time the swap lane opens and the first time you pick up an item.
import { escapeHtml } from './html';
import { howToCards } from './roleKeys';
import { t } from '../i18n';

export const HINTS = ['roleCard', 'swap', 'item'] as const;
export type Hint = (typeof HINTS)[number];

const KEY = 'efw.seen';

/** Which hints this browser has already seen (junk or blocked storage = none). Pure, for tests. */
export function parseSeen(raw: string | null): Set<Hint> {
  try {
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((h): h is Hint => (HINTS as readonly unknown[]).includes(h)) : []);
  } catch {
    return new Set();
  }
}

export class Onboarding {
  private readonly seen: Set<Hint>;

  constructor() {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch {
      // blocked storage: show the hints every visit
    }
    this.seen = parseSeen(raw);
  }

  has(h: Hint): boolean {
    return this.seen.has(h);
  }

  mark(h: Hint): void {
    if (this.seen.has(h)) return;
    this.seen.add(h);
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...this.seen]));
    } catch {
      // not remembered
    }
  }
}

/** One-time hint texts (HTML-safe, in the page's language). */
export const hintText = (hint: 'swap' | 'item'): string => t(hint === 'swap' ? 'hint.swap' : 'hint.item');

/** The big "this is you" card during your first countdown: your role, its job and its keys. */
export class RoleCard {
  private readonly el = document.createElement('div');
  private shown = '';

  constructor(parent: HTMLElement) {
    this.el.className = 'role-card';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  /** Show the card for `role` ('pilot' | 'engineer' | 'solo'), or hide it (null). */
  set(role: string | null): void {
    const card = howToCards().find((c) => c.role === role);
    if (!card) {
      this.el.hidden = true;
      this.shown = '';
      return;
    }
    this.el.hidden = false;
    if (this.shown === card.role) return;
    this.shown = card.role;
    this.el.dataset.role = card.role;
    const keys = card.keys.map(([k, what]) => `<li><kbd>${escapeHtml(k)}</kbd> ${escapeHtml(what)}</li>`).join('');
    this.el.innerHTML = `<span class="you">${t('card.youAre')}</span><strong>${escapeHtml(card.title)}</strong><p>${escapeHtml(card.job)}</p><ul>${keys}</ul><span class="more">${t('card.more')}</span>`;
  }

  dispose(): void {
    this.el.remove();
  }
}
