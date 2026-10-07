// Settings and key help (P8.2): one window with two tabs, opened from the menu or the gear
// button. Quality applies when the race view is created (menu → PLAY), so in a race it offers
// a reload (your seat is held, you come straight back).
import type { Volumes } from '../audio/mixer';
import type { CameraMode } from '../input/cameraPref';
import { QUALITY_SETTINGS, type QualitySetting, type Settings } from '../settings';
import { isTyping } from '../input/keyboard';
import { keyHelp } from './roleKeys';
import { volumeSliders } from './volumePanel';
import { LANG_NAMES, LANG_SETTINGS, nameOf, t, type StringKey } from '../i18n';

export type SettingsTab = 'settings' | 'keys';

export interface SettingsHandlers {
  settings: Settings;
  /** The shared levels (read on open, so other panels' changes show). */
  volumes: () => Volumes;
  /** The current camera mode (read on open: C may have switched it). */
  camera: () => CameraMode;
  /** In a race: changing quality or decorations needs a reload. */
  inRace: boolean;
  /** Seasonal decorations to offer (config/seasons.json). */
  seasons: readonly { id: string; name: string }[];
  onSettings(s: Settings): void;
  onVolumes(v: Volumes): void;
  onCamera(mode: CameraMode): void;
}

/** What a key press does to the help window. "?" by character (any layout: `؟` on Arabic), or F1. Pure, for tests. */
export function helpKeyAction(
  e: { key: string; code: string; repeat: boolean },
  open: boolean,
  showingKeys: boolean,
): 'openKeys' | 'close' | null {
  if (e.repeat) return null;
  if (e.key === '?' || e.key === '؟' || e.code === 'F1') return open && showingKeys ? 'close' : 'openKeys';
  if (e.code === 'Escape' && open) return 'close';
  return null;
}

const QUALITY_LABEL: Record<QualitySetting, StringKey> = { auto: 'settings.auto', low: 'settings.low', medium: 'settings.medium', high: 'settings.high' };

/** A row of toggle buttons (the chosen one is `.on`). */
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
      b.blur(); // Enter must not click it again mid-race
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
  private refreshVolumes: () => void = () => {};
  private cameraRow: HTMLElement | null = null;

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
    close.addEventListener('click', () => {
      close.blur();
      this.close();
    });
    const tabRow = document.createElement('div');
    tabRow.className = 'tab-row';
    const tabButton = (tab: SettingsTab, text: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.dataset.tab = tab;
      b.textContent = text;
      b.addEventListener('click', () => {
        b.blur();
        this.open(tab);
      });
      tabRow.appendChild(b);
      return b;
    };
    this.tabButtons = { settings: tabButton('settings', t('settings.tab')), keys: tabButton('keys', t('settings.keysTab')) };
    this.tabs = { settings: this.buildSettings(), keys: this.buildKeys() };
    box.append(close, tabRow, this.tabs.settings, this.tabs.keys);
    this.root.appendChild(box);
    // Click outside the box closes; clicks inside never reach the game (pointer lock).
    this.root.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === this.root) this.close();
    });
    parent.appendChild(this.root);
    // Capture phase: runs before the lobby's Esc handler, so Esc only closes this window.
    window.addEventListener('keydown', this.onKey, true);
  }

  /** "?" (or F1) opens the key help any time and closes it again; Esc closes the window. */
  private readonly onKey = (e: KeyboardEvent): void => {
    if (isTyping(e.target)) return;
    const action = helpKeyAction(e, this.isOpen, !this.tabs.keys.hidden);
    if (!action) return;
    e.preventDefault();
    if (e.code === 'Escape') e.stopImmediatePropagation(); // just close this, do not also toggle the lobby
    if (action === 'close') this.close();
    else this.open('keys');
  };

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(tab: SettingsTab): void {
    this.root.hidden = false;
    this.refreshVolumes();
    const mode = this.h.camera();
    this.cameraRow?.querySelectorAll<HTMLElement>('.choice').forEach((b) => b.classList.toggle('on', b.dataset.value === mode));
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
    reload.textContent = t('settings.reload');
    reload.hidden = true;
    reload.addEventListener('click', () => window.location.reload());
    const quality = choices(QUALITY_SETTINGS, (q) => t(QUALITY_LABEL[q]), this.settings.quality, (q) => {
      this.settings = { ...this.settings, quality: q };
      this.h.onSettings(this.settings);
      reload.hidden = !this.h.inRace;
    });
    const qualityNote = document.createElement('p');
    qualityNote.className = 'note';
    qualityNote.textContent = t('settings.qualityNote');
    const decorReload = reload.cloneNode(true) as HTMLButtonElement;
    decorReload.addEventListener('click', () => window.location.reload());
    const seasonName = new Map(this.h.seasons.map((x) => [x.id, x.name]));
    const decorOptions = ['auto', 'off', ...this.h.seasons.map((x) => x.id)];
    const decor = choices(decorOptions, (d) => (d === 'auto' ? t('settings.auto') : d === 'off' ? t('settings.off') : nameOf(`season.${d}`, seasonName.get(d) ?? d)), this.settings.decor, (d) => {
      this.settings = { ...this.settings, decor: d };
      this.h.onSettings(this.settings);
      decorReload.hidden = !this.h.inRace;
    });
    const decorNote = document.createElement('p');
    decorNote.className = 'note';
    decorNote.textContent = t('settings.decorNote');
    // Language: the whole page is built in it, so a change always needs a reload.
    const langReload = reload.cloneNode(true) as HTMLButtonElement;
    langReload.addEventListener('click', () => {
      // A `?lang=` in the address (screenshots) would win over the new choice: drop it.
      const params = new URLSearchParams(window.location.search);
      if (params.has('lang')) {
        params.delete('lang');
        window.location.search = params.toString();
      } else {
        window.location.reload();
      }
    });
    const language = choices(LANG_SETTINGS, (l) => (l === 'auto' ? t('settings.auto') : LANG_NAMES[l]), this.settings.lang, (l) => {
      this.settings = { ...this.settings, lang: l };
      this.h.onSettings(this.settings);
      langReload.hidden = false;
    });
    const langNote = document.createElement('p');
    langNote.className = 'note';
    langNote.textContent = t('settings.languageNote');
    const camera = choices(['chase', 'cockpit'] as const, (c) => (c === 'chase' ? t('settings.chase') : t('settings.cockpit')), this.h.camera(), (c) => this.h.onCamera(c));
    this.cameraRow = camera;
    const volumes = volumeSliders(this.h.volumes, (v) => this.h.onVolumes(v));
    this.refreshVolumes = volumes.refresh;
    const fpsLabel = this.checkbox('showFps', t('settings.fps'));
    const ghostLabel = this.checkbox('ghost', t('settings.ghost'));
    page.append(
      section(t('settings.language'), language, langNote, langReload),
      section(t('settings.quality'), quality, qualityNote, reload),
      section(t('settings.sound'), volumes.el),
      section(t('settings.camera'), camera),
      section(t('settings.screen'), fpsLabel, ghostLabel),
      section(t('settings.decorations'), decor, decorNote, decorReload),
    );
    return page;
  }

  /** A checkbox for an on/off setting, saved when clicked. */
  private checkbox(key: 'showFps' | 'ghost', text: string): HTMLElement {
    const label = document.createElement('label');
    label.className = 'check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.settings[key];
    box.dataset.key = key;
    box.addEventListener('change', () => {
      box.blur();
      this.settings = { ...this.settings, [key]: box.checked };
      this.h.onSettings(this.settings);
    });
    label.append(box, text);
    return label;
  }

  private buildKeys(): HTMLElement {
    const page = document.createElement('div');
    page.className = 'tab-page keys-page';
    for (const group of keyHelp()) {
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
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }
}
