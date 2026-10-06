// Short messages near the top of the screen ("You got Coffee Spill!", "Hit by Reply-All!").
// Both players of a car see the ones about their car. A few at most; each fades by itself.

/** How long a toast stays (ms) and how many show at once. */
const SHOW_MS = 2400;
const MAX_TOASTS = 3;

export type ToastKind = 'good' | 'bad' | 'info';

export class Toasts {
  private readonly el = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.el.className = 'toasts';
    parent.appendChild(this.el);
  }

  /** `html` must be trusted (built from our own strings; player names escaped by the caller). */
  show(html: string, kind: ToastKind): void {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = html;
    this.el.appendChild(t);
    while (this.el.childElementCount > MAX_TOASTS) this.el.firstElementChild?.remove();
    window.setTimeout(() => t.remove(), SHOW_MS);
  }

  dispose(): void {
    this.el.remove();
  }
}
