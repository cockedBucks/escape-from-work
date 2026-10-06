// Settings and key help (P8.2): one window with two tabs, opened from the menu or the gear
// button. Quality applies when the race view is created (menu → PLAY), so in a race it offers
// a reload (your seat is held, you come straight back).
import type { Volumes } from '../audio/mixer';
import type { CameraMode } from '../input/cameraPref';
import { QUALITY_SETTINGS, type QualitySetting, type Settings } from '../settings';
import { KEY_HELP } from './roleKeys';
import { volumeSliders } from './volumePanel';

export type SettingsTab = 'settings' | 'keys';

export interface SettingsHandlers {
  settings: Settings;
  volumes: Volumes;
  camera: CameraMode;
  /** In a race: changing quality needs a reload. */
  inRace: boolean;
  onSettings(s: Settings): void;
  onVolumes(v: Volumes): void;
  onCamera(mode: CameraMode): void;
}

const QUALITY_LABEL: Record<QualitySetting, string> = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High' };

/** A row of toggle buttons; returns the row and a function that marks the chosen one. */
function choices<T extends string>(options: readonly T[], label: (o: T) => string, chosen: T, pick: (o: T) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'choice-row';
  const buttons = options.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.dataset.value = o;
    b.textContent = label(o);
    b.addEventListener('click', () => {
      for (const other of buttons) other.classList.toggle('on', other === b);
      pick(o);
    });
    b.classList.toggle('on', o === chosen);
    return b;
  });
  row.append(...buttons);
  return row;
}

function section(title: string, ...content: HTMLElement[]): HTMLElement {
  const s = document.createElement('section');
  const h = document.createElement('h3');
  h.textContent = title;
  s.append(h, ...content);
  return s;
}

export class SettingsScreen {
  private readonly root = document.createElement('div');
  private readonly tabs: Record<SettingsTab, HTMLElement>;
  private readonly tabButtons: Record<SettingsTab, HTMLButtonElement>;
  private settings: Settings;

  constructor(parent: HTMLElement, private readonly h: SettingsHandlers) {
    this.settings = { ...h.settings };
    this.root.className = 'modal';
    this.root.hidden = true;
    const box = document.createElement('div');
    box.className = 'modal-box settings';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'modal-close';
    close.dataset.action = 'close';
    close.textContent = '×';
    close.addEventListener('click', () => this.close());
    const tabRow = document.createElement('div');
    tabRow.className = 'tab-row';
    const tabButton = (tab: SettingsTab, text: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.dataset.tab = tab;
      b.textContent = text;
      b.addEventListener('click', () => this.open(tab));
      tabRow.appendChild(b);
      return b;
    };
    this.tabButtons = { settings: tabButton('settings', 'Settings'), keys: tabButton('keys', 'Keys') };
    this.tabs = { settings: this.buildSettings(), keys: this.buildKeys() };
    box.append(close, tabRow, this.tabs.settings, this.tabs.keys);
    this.root.appendChild(box);
    // Click outside the box closes; clicks inside never reach the game (pointer lock).
    this.root.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === this.root) this.close();
    });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(tab: SettingsTab): void {
    this.root.hidden = false;
    for (const t of ['settings', 'keys'] as const) {
      this.tabs[t].hidden = t !== tab;
      this.tabButtons[t].classList.toggle('on', t === tab);
    }
  }

  close(): void {
    this.root.hidden = true;
  }

  private buildSettings(): HTMLElement {
    const page = document.createElement('div');
    page.className = 'tab-page';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'reload';
    reload.textContent = 'Reload to apply (you keep your seat)';
    reload.hidden = true;
    reload.addEventListener('click', () => window.location.reload());
    const quality = choices(QUALITY_SETTINGS, (q) => QUALITY_LABEL[q], this.settings.quality, (q) => {
      this.settings = { ...this.settings, quality: q };
      this.h.onSettings(this.settings);
      reload.hidden = !this.h.inRace;
    });
    const qualityNote = document.createElement('p');
    qualityNote.className = 'note';
    qualityNote.textContent = 'Low for slow laptops; Auto uses the host’s default.';
    const camera = choices(['chase', 'cockpit'] as const, (c) => (c === 'chase' ? 'Behind the car' : 'Cockpit'), this.h.camera, (c) => this.h.onCamera(c));
    const fpsLabel = document.createElement('label');
    fpsLabel.className = 'check';
    const fps = document.createElement('input');
    fps.type = 'checkbox';
    fps.checked = this.settings.showFps;
    fps.dataset.key = 'showFps';
    fps.addEventListener('change', () => {
      fps.blur();
      this.settings = { ...this.settings, showFps: fps.checked };
      this.h.onSettings(this.settings);
    });
    fpsLabel.append(fps, ' Show FPS in the corner');
    page.append(
      section('Picture quality', quality, qualityNote, reload),
      section('Sound', volumeSliders(this.h.volumes, (v) => this.h.onVolumes(v))),
      section('Default camera (C switches any time)', camera),
      section('Screen', fpsLabel),
    );
    return page;
  }

  private buildKeys(): HTMLElement {
    const page = document.createElement('div');
    page.className = 'tab-page keys-page';
    for (const group of KEY_HELP) {
      const list = document.createElement('dl');
      for (const [keys, what] of group.keys) {
        const dt = document.createElement('dt');
        dt.textContent = keys;
        const dd = document.createElement('dd');
        dd.textContent = what;
        list.append(dt, dd);
      }
      page.appendChild(section(group.title, list));
    }
    return page;
  }

  dispose(): void {
    this.root.remove();
  }
}
