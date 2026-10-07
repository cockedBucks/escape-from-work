import { VOLUME_KEYS, type Volumes } from '../audio/mixer';
import { t, type StringKey } from '../i18n';

const LABELS: Record<(typeof VOLUME_KEYS)[number], StringKey> = { master: 'volume.master', engine: 'volume.engine', sfx: 'volume.sfx', music: 'volume.music' };

/** Four labelled volume sliders; `refresh()` moves them to the current levels (another panel may have changed them). */
export interface VolumeSliders {
  el: HTMLElement;
  refresh(): void;
}

/**
 * Four labelled volume sliders (0–100), shared by the speaker button and the settings screen.
 * Each move merges into the CURRENT levels (`get`), so two panels never undo each other.
 */
export function volumeSliders(get: () => Volumes, set: (v: Volumes) => void): VolumeSliders {
  const sliders: HTMLInputElement[] = [];
  const box = document.createElement('div');
  box.className = 'volume-sliders';
  for (const key of VOLUME_KEYS) {
    const label = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = t(LABELS[key]);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.dataset.key = key;
    // Hand the keys back to the game after dragging (arrows would move the slider).
    slider.addEventListener('change', () => slider.blur());
    slider.addEventListener('input', () => set({ ...get(), [key]: Number(slider.value) / 100 }));
    sliders.push(slider);
    label.append(name, slider);
    box.appendChild(label);
  }
  const refresh = (): void => {
    const v = get();
    VOLUME_KEYS.forEach((key, i) => (sliders[i]!.value = String(Math.round(v[key] * 100))));
  };
  refresh();
  return { el: box, refresh };
}

/**
 * A small speaker button (top right) that opens the volume sliders, plus a gear button that
 * opens the settings screen (when `onSettings` is given).
 */
export class VolumePanel {
  private readonly root = document.createElement('div');
  private readonly button = document.createElement('button');
  private readonly panel = document.createElement('div');

  /** `get`/`set` = the shared levels (HornPlayer.volumes / setVolumes). */
  constructor(parent: HTMLElement, private readonly get: () => Volumes, private readonly set: (v: Volumes) => void, onSettings?: () => void) {
    this.root.className = 'volume';
    const row = document.createElement('div');
    row.className = 'volume-row';
    this.button.type = 'button';
    this.button.className = 'volume-button';
    this.button.title = t('volume.title');
    this.panel.className = 'volume-panel';
    this.panel.hidden = true;
    const sliders = volumeSliders(get, (v) => {
      this.set(v);
      this.paint(v);
    });
    this.panel.appendChild(sliders.el);
    this.button.addEventListener('click', (e) => {
      e.stopPropagation(); // not a click on the game (pointer lock)
      this.button.blur(); // Enter must not click it again mid-race
      this.panel.hidden = !this.panel.hidden;
      if (!this.panel.hidden) sliders.refresh();
      this.paint(this.get());
    });
    this.panel.addEventListener('click', (e) => e.stopPropagation());
    if (onSettings) {
      const gear = document.createElement('button');
      gear.type = 'button';
      gear.className = 'volume-button';
      gear.title = t('volume.gear');
      gear.dataset.action = 'settings';
      gear.textContent = '⚙';
      gear.addEventListener('click', (e) => {
        e.stopPropagation();
        gear.blur();
        this.panel.hidden = true;
        onSettings();
      });
      row.appendChild(gear);
    }
    row.appendChild(this.button);
    this.root.append(row, this.panel);
    parent.appendChild(this.root);
    this.paint(get());
  }

  private paint(v: Volumes): void {
    this.button.textContent = v.master === 0 ? '🔇' : '🔊';
  }

  dispose(): void {
    this.root.remove();
  }
}
