// Race HUD (chase cam, DOM): "3… 2… 1… CLOCK OUT!", lap and place, wrong-way warning,
// finish banner. Text comes from a pure function; the DOM is touched only when it changes.
import type { RacePhase } from '@escape/shared';

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
  me: { lapsDone: number; place: number; finished: boolean; dnf: boolean; wrongWay: boolean } | null;
}

export interface HudText {
  countdown: string | null;
  lap: string | null;
  place: string | null;
  banner: string | null;
  wrongWay: boolean;
}

/** How long "CLOCK OUT!" stays up after the start (s). */
const GO_SECONDS = 1;

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

export function hudText(h: HudInput): HudText {
  const since = (h.tick - h.phaseTick) * h.dt;
  let countdown: string | null = null;
  if (h.phase === 'countdown') countdown = String(Math.max(1, Math.ceil(h.countdownSeconds - since)));
  else if (h.phase === 'racing' && since < GO_SECONDS) countdown = 'CLOCK OUT!';

  const racing = h.phase === 'racing' || h.phase === 'results';
  const me = racing ? h.me : null;
  const lap = me && !me.finished && !me.dnf ? `LAP ${Math.min(me.lapsDone + 1, h.laps)}/${h.laps}` : null;
  const place = me && me.place > 0 ? `${ordinal(me.place)} / ${h.cars}` : null;
  const banner = me?.finished ? `FINISHED ${ordinal(me.place)}!` : me?.dnf ? 'DNF — out of time' : null;
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
    this.wrong.textContent = '⚠ WRONG WAY';
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
