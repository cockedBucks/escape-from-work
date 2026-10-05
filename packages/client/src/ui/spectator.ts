// Spectator cam (P3.5): when you are not in a car, the camera follows one car and moves to
// the next every few seconds; A/D or ←/→ switch by hand (then it waits longer before
// cycling again). A label says whom you are watching.

/** Auto-cycle to the next car this often (ms). */
const CYCLE_MS = 8000;
/** After a manual switch, wait this long before auto-cycling again (ms). */
const MANUAL_HOLD_MS = 20000;

const PREV = new Set(['KeyA', 'ArrowLeft']);
const NEXT = new Set(['KeyD', 'ArrowRight']);

/** Pick the car to watch: keep the current one if it still exists, else the first. */
export function pickWatched(cars: readonly string[], current: string | null, step: number): string | null {
  if (cars.length === 0) return null;
  const at = current === null ? -1 : cars.indexOf(current);
  if (at < 0) return cars[0] ?? null;
  return cars[(((at + step) % cars.length) + cars.length) % cars.length] ?? null;
}

export class Spectator {
  private readonly label = document.createElement('div');
  private cars: string[] = [];
  private watched: string | null = null;
  private active = false;
  private lastSwitch = 0;
  private holdUntil = 0;

  constructor(
    parent: HTMLElement,
    /** Display name for a car id (team name). */
    private readonly nameOf: (carId: string) => string,
  ) {
    this.label.className = 'spectator-label';
    this.label.hidden = true;
    parent.appendChild(this.label);
    window.addEventListener('keydown', this.onKey);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.active || e.target instanceof HTMLInputElement) return;
    const step = PREV.has(e.code) ? -1 : NEXT.has(e.code) ? 1 : 0;
    if (step === 0) return;
    this.watched = pickWatched(this.cars, this.watched, step);
    this.holdUntil = performance.now() + MANUAL_HOLD_MS;
    this.showLabel();
  };

  /**
   * Call on every state update. `active` = you are not in a car. `cars` = car ids in the
   * order to cycle through (by place during a race).
   */
  update(active: boolean, cars: string[], now: number): void {
    this.active = active;
    this.cars = cars;
    if (!active) {
      this.label.hidden = true;
      return;
    }
    if (this.watched === null || !cars.includes(this.watched)) {
      this.watched = pickWatched(cars, null, 0);
      this.lastSwitch = now;
    } else if (now > this.holdUntil && now - this.lastSwitch > CYCLE_MS) {
      this.watched = pickWatched(cars, this.watched, 1);
      this.lastSwitch = now;
    }
    this.showLabel();
  }

  private showLabel(): void {
    const text = this.watched ? `👀 Watching ${this.nameOf(this.watched)} · A/D to switch` : '';
    if (this.label.textContent !== text) this.label.textContent = text;
    this.label.hidden = !this.active || this.watched === null;
  }

  /** Car the camera should follow while spectating. */
  get target(): string | null {
    return this.active ? this.watched : null;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.label.remove();
  }
}
