// Race HUD (chase cam, DOM): "3… 2… 1… CLOCK OUT!", lap and place, wrong-way warning,
// finish banner. Text comes from a pure function; the DOM is touched only when it changes.
import type { RacePhase } from '@escape/shared';
import { ordinal, t } from '../i18n';

export { ordinal } from '../i18n';

export interface HudInput {
  phase: RacePhase;
  /** Server tick of this state and the tick the phase began. */
  tick: number;
  phaseTick: number;
  dt: number;
  countdownSeconds: number;
  laps: number;
  /** Cars in the race. */
  cars: number;
  /** Your car's race info, or null when you are watching. */
  me: { lapsDone: number; place: number; finished: boolean; dnf: boolean; wrongWay: boolean; lives?: number; out?: boolean } | null;
  /** 'battle' shows lives instead of laps (P11.6); absent = race. */
  mode?: string;
}

/** "❤❤❤" for 3 lives. */
export const hearts = (lives: number): string => '❤'.repeat(Math.max(0, lives));

export interface HudText {
  countdown: string | null;
  lap: string | null;
  place: string | null;
  banner: string | null;
  wrongWay: boolean;
}

/** How long "CLOCK OUT!" stays up after the start (s). */
const GO_SECONDS = 1;


export function hudText(h: HudInput): HudText {
  const since = (h.tick - h.phaseTick) * h.dt;
  let countdown: string | null = null;
  if (h.phase === 'countdown') countdown = String(Math.max(1, Math.ceil(h.countdownSeconds - since)));
  else if (h.phase === 'racing' && since < GO_SECONDS) countdown = t('hud.go');

  const racing = h.phase === 'racing' || h.phase === 'results';
  const me = racing ? h.me : null;
  const place = me && me.place > 0 ? t('hud.place', { ord: ordinal(me.place), cars: h.cars }) : null;
  if (h.mode === 'battle') {
    const lives = me && !me.out ? t('hud.lives', { hearts: hearts(me.lives ?? 0) }) : null;
    return { countdown, lap: lives, place, banner: me?.out ? t('hud.out') : null, wrongWay: false };
  }
  const lap = me && !me.finished && !me.dnf ? t('hud.lap', { n: Math.min(me.lapsDone + 1, h.laps), laps: h.laps }) : null;
  const banner = me?.finished ? t('hud.finished', { ord: ordinal(me.place) }) : me?.dnf ? t('hud.dnf') : null;
  return { countdown, lap, place, banner, wrongWay: h.phase === 'racing' && (me?.wrongWay ?? false) };
}

export class RaceHud {
  private readonly root = document.createElement('div');
  private readonly countdown = document.createElement('div');
  private readonly info = document.createElement('div');
  private readonly banner = document.createElement('div');
  private readonly wrong = document.createElement('div');
  private last = '';

  constructor(parent: HTMLElement) {
    this.root.className = 'race-hud';
    this.countdown.className = 'hud-countdown';
    this.countdown.hidden = true;
    this.info.className = 'hud-info';
    this.banner.className = 'hud-banner';
    this.wrong.className = 'hud-wrong';
    this.wrong.textContent = t('hud.wrongWay');
    this.root.append(this.countdown, this.info, this.banner, this.wrong);
    parent.appendChild(this.root);
    this.set({ countdown: null, lap: null, place: null, banner: null, wrongWay: false });
  }

  set(t: HudText): void {
    const key = JSON.stringify(t);
    if (key === this.last) return;
    this.last = key;
    if (this.countdown.textContent !== (t.countdown ?? '')) {
      this.countdown.textContent = t.countdown ?? '';
      this.countdown.hidden = t.countdown === null;
      // Restart the pop animation only for a new countdown number (forces one reflow).
      this.countdown.classList.remove('pop');
      void this.countdown.offsetWidth;
      if (t.countdown) this.countdown.classList.add('pop');
    }
    this.info.innerHTML = [t.lap, t.place].filter(Boolean).map((s) => `<span>${s}</span>`).join('');
    this.info.hidden = !t.lap && !t.place;
    this.banner.textContent = t.banner ?? '';
    this.banner.hidden = t.banner === null;
    this.wrong.hidden = !t.wrongWay;
  }

  dispose(): void {
    this.root.remove();
  }
}
