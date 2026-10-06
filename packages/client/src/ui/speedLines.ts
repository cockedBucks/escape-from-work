// Speed lines: white streaks at the screen edges that fade in when the car goes fast and
// grow with a drift boost or nitro (sense of speed; DOM + CSS, no draw calls).

/** Streaks start at this share of top speed and are full at `FULL_AT`. */
const START_AT = 0.85;
const FULL_AT = 1.3;
/** A drift boost or nitro adds this much. */
const BOOST_EXTRA = 0.55;
/** Opacity changes smaller than this do not touch the DOM. */
const STEP = 0.02;

/** How strong the streaks are (0–1) at `speedShare` × top speed. */
export function speedLineStrength(speedShare: number, boosting: boolean): number {
  const t = (speedShare - START_AT) / (FULL_AT - START_AT);
  return Math.min(1, Math.max(0, t) + (boosting ? BOOST_EXTRA : 0));
}

export class SpeedLines {
  private readonly el = document.createElement('div');
  private shown = -1;

  constructor(parent: HTMLElement) {
    this.el.className = 'speed-lines';
    parent.appendChild(this.el);
  }

  update(strength: number): void {
    if (Math.abs(strength - this.shown) < STEP && !(strength === 0 && this.shown !== 0)) return;
    this.shown = strength;
    this.el.style.opacity = strength.toFixed(2);
  }

  dispose(): void {
    this.el.remove();
  }
}
