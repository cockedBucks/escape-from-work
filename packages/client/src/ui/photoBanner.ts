// Photo-finish banner (P11.2): "PHOTO FINISH!" over the slow-motion replay, a camera flash at
// each car crossing the line, and who won by how much.
import { t } from '../i18n';

export class PhotoBanner {
  private readonly el = document.createElement('div');
  private readonly flashEl = document.createElement('div');
  private readonly lineEl = document.createElement('span');
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'photo-finish';
    this.el.hidden = true;
    this.flashEl.className = 'photo-flash';
    const title = document.createElement('strong');
    title.textContent = t('photo.title');
    this.lineEl.className = 'who';
    const badge = document.createElement('span');
    badge.className = 'replay-badge';
    badge.innerHTML = `<span class="dot">●</span> ${t('photo.replay')}`;
    this.el.append(this.flashEl, badge, title, this.lineEl);
    parent.appendChild(this.el);
  }

  /** Show it with `html` as the result line (already escaped). */
  show(html: string): void {
    window.clearTimeout(this.timer);
    this.lineEl.innerHTML = html;
    this.el.hidden = false;
  }

  /** The camera flash (a car crossed the line in the replay). */
  flash(): void {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth; // restart the animation
    this.flashEl.classList.add('go');
  }

  /** Hide after `ms`. */
  hide(ms: number): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.el.hidden = true;
    }, ms);
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.el.remove();
  }
}
