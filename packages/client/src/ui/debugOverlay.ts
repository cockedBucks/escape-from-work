import type { GameStats } from '../test-hooks';

/** Text refreshes this often (ms): readable, and no layout work every frame. */
const REFRESH_MS = 250;

const fmt = (v: number | null, digits = 0): string => (v === null ? '–' : v.toFixed(digits));

/** F3 debug overlay: fps, ping, draw calls, triangles, server tick cost. DOM, top-left. */
export class DebugOverlay {
  private readonly el = document.createElement('pre');
  private visible = false;
  private lastRefresh = 0;

  constructor(parent: HTMLElement, private readonly stats: () => GameStats) {
    this.el.className = 'debug-overlay';
    this.el.hidden = true;
    parent.appendChild(this.el);
    window.addEventListener('keydown', this.onKey);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'F3') return;
    e.preventDefault();
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
    this.lastRefresh = 0;
  };

  /** Call once per frame; cheap when hidden. */
  update(now: number): void {
    if (!this.visible || now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    const s = this.stats();
    this.el.textContent =
      `fps   ${fmt(s.fps)}\n` +
      `ping  ${fmt(s.pingMs)} ms\n` +
      `tick  ${fmt(s.tickMs, 2)} ms\n` +
      `draws ${s.drawCalls}\n` +
      `tris  ${s.triangles}\n` +
      `cars  ${s.cars}`;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.el.remove();
  }
}
