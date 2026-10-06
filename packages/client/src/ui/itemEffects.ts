// What an item hit looks like on BOTH screens of the target car (GAME_DESIGN §7): a fake blue
// error screen, a Forced Update progress bar ("mash any key!"), and warning banners for Control
// Swap and Lag Spike. DOM + CSS; the DOM is touched only when an effect starts or ends (and
// the progress bar's width while updating).

/** The synced effect timers of your car (seconds left; 0 = none). */
export interface EffectTimers {
  blueLeft: number;
  lagLeft: number;
  swapLeft: number;
  updateLeft: number;
}

/** Forced Update progress 0–1 from the time left and the longest it can take. */
export const updateProgress = (left: number, max: number): number => Math.min(1, Math.max(0, 1 - left / max));

export class ItemEffectsOverlay {
  private readonly blue = document.createElement('div');
  private readonly update = document.createElement('div');
  private readonly bar = document.createElement('i');
  private readonly banner = document.createElement('div');
  private bannerText = '';
  private width = '';

  constructor(parent: HTMLElement) {
    this.blue.className = 'fx-bluescreen';
    this.blue.hidden = true;
    this.blue.innerHTML =
      '<div class="face">:(</div><p>Your PC ran into a problem and needs to restart. We’re just collecting some error info, and then we’ll restart for you.</p>' +
      '<p class="stop">STOP CODE: TOO_MUCH_YELLING</p>';
    this.update.className = 'fx-update';
    this.update.hidden = true;
    this.update.innerHTML = '<strong>Installing update 1 of 1…</strong><span>Do not turn off your car. MASH ANY KEY to go faster!</span><div class="bar"></div>';
    this.update.querySelector('.bar')!.appendChild(this.bar);
    this.banner.className = 'fx-banner';
    this.banner.hidden = true;
    parent.append(this.blue, this.update, this.banner);
  }

  /** Call when your car's state changes (or every frame; it only touches the DOM on change). */
  set(t: EffectTimers | null, updateMax: number): void {
    const blue = t !== null && t.blueLeft > 0;
    if (this.blue.hidden === blue) this.blue.hidden = !blue;
    const updating = t !== null && t.updateLeft > 0;
    if (this.update.hidden === updating) this.update.hidden = !updating;
    if (updating) {
      const w = `${Math.round(updateProgress(t.updateLeft, updateMax) * 100)}%`;
      if (w !== this.width) {
        this.width = w;
        this.bar.style.width = w;
      }
    }
    const lines: string[] = [];
    if (t && t.swapLeft > 0) lines.push('CONTROL SWAP! Pilot keys = pedals, Engineer keys = steering');
    if (t && t.lagLeft > 0) lines.push('LAG SPIKE! Your controls arrive late');
    const text = lines.join(' · ');
    if (text !== this.bannerText) {
      this.bannerText = text;
      this.banner.textContent = text;
      this.banner.hidden = text === '';
    }
  }

  dispose(): void {
    this.blue.remove();
    this.update.remove();
    this.banner.remove();
  }
}
