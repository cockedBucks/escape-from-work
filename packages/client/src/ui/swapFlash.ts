// Big center flash when your car takes the swap lane: the new role and its keys, so the
// player who was steering knows at once they now run the pedals (and the other way round).
import { roleText } from './roleKeys';
import { t as tr } from '../i18n';

/** How long the flash stays up (ms). */
const SHOW_MS = 2600;

export class SwapFlash {
  private readonly el = document.createElement('div');
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'swap-flash';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  /** Show "SWAP!" with `role` ('pilot' | 'engineer' | 'solo'). Solo only gets the cooled engine. */
  show(role: string): void {
    const t = roleText(role);
    const line = role === 'solo' ? tr('swap.cooled') : tr('swap.youAre', { role: t.title });
    this.el.innerHTML = `<strong>${tr('swap.title')}</strong><span class="who">${line}</span><span class="keys">${t.keys}</span>`;
    this.el.dataset['role'] = role;
    this.el.hidden = false;
    // Restart the pop-in animation even if a flash is already showing.
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.el.hidden = true;
    }, SHOW_MS);
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.el.remove();
  }
}
