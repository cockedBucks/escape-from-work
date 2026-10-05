// Small DOM badge: which role you play right now and which keys that gives you.
// It flashes when the role changes (partner joined/left, swap lane).
import { roleText } from './roleKeys';

/** How long the "your role changed" flash lasts (ms). */
const FLASH_MS = 1500;

export class RoleBadge {
  private readonly el = document.createElement('div');
  private role: string | null = null;
  private flashTimer = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'role-badge';
    parent.appendChild(this.el);
  }

  /** `role` as synced: 'pilot' | 'engineer' | 'solo' | '' (not in a car). */
  set(role: string): void {
    if (role === this.role) return;
    const changed = this.role !== null;
    this.role = role;
    const t = roleText(role);
    this.el.dataset['role'] = role || 'none';
    this.el.innerHTML = `<strong>${t.title}</strong><span>${t.keys}</span>`;
    if (changed) {
      this.el.classList.add('flash');
      window.clearTimeout(this.flashTimer);
      this.flashTimer = window.setTimeout(() => this.el.classList.remove('flash'), FLASH_MS);
    }
  }

  dispose(): void {
    window.clearTimeout(this.flashTimer);
    this.el.remove();
  }
}
