import { VOLUME_KEYS, type Volumes } from '../audio/mixer';

const LABELS: Record<(typeof VOLUME_KEYS)[number], string> = { master: 'Master', engine: 'Engine', sfx: 'Effects', music: 'Music' };

/**
 * Four labelled volume sliders (0–100). `onChange` gets the new levels on every move. Shared by
 * the speaker button and the settings screen.
 */
export function volumeSliders(volumes: Volumes, onChange: (v: Volumes) => void): HTMLElement {
  let vol = { ...volumes };
  const box = document.createElement('div');
  box.className = 'volume-sliders';
  for (const key of VOLUME_KEYS) {
    const label = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = LABELS[key];
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(vol[key] * 100));
    slider.dataset.key = key;
    // Hand the keys back to the game after dragging (arrows would move the slider).
    slider.addEventListener('change', () => slider.blur());
    slider.addEventListener('input', () => {
      vol = { ...vol, [key]: Number(slider.value) / 100 };
      onChange(vol);
    });
    label.append(name, slider);
    box.appendChild(label);
  }
  return box;
}

/**
 * A small speaker button (top right) that opens the volume sliders, plus a gear button that
 * opens the settings screen (when `onSettings` is given).
 */
export class VolumePanel {
  private readonly root = document.createElement('div');
  private readonly button = document.createElement('button');
  private readonly panel = document.createElement('div');

  constructor(parent: HTMLElement, volumes: Volumes, private readonly onChange: (v: Volumes) => void, onSettings?: () => void) {
    this.root.className = 'volume';
    const row = document.createElement('div');
    row.className = 'volume-row';
    this.button.type = 'button';
    this.button.className = 'volume-button';
    this.button.title = 'Sound volume';
    this.panel.className = 'volume-panel';
    this.panel.hidden = true;
    this.panel.appendChild(volumeSliders(volumes, (v) => {
      this.onChange(v);
      this.paint(v);
    }));
    this.button.addEventListener('click', (e) => {
      e.stopPropagation(); // not a click on the game (pointer lock)
      this.panel.hidden = !this.panel.hidden;
    });
    this.panel.addEventListener('click', (e) => e.stopPropagation());
    if (onSettings) {
      const gear = document.createElement('button');
      gear.type = 'button';
      gear.className = 'volume-button';
      gear.title = 'Settings and keys';
      gear.dataset.action = 'settings';
      gear.textContent = '⚙';
      gear.addEventListener('click', (e) => {
        e.stopPropagation();
        this.panel.hidden = true;
        onSettings();
      });
      row.appendChild(gear);
    }
    row.appendChild(this.button);
    this.root.append(row, this.panel);
    parent.appendChild(this.root);
    this.paint(volumes);
  }

  private paint(v: Volumes): void {
    this.button.textContent = v.master === 0 ? '🔇' : '🔊';
  }

  dispose(): void {
    this.root.remove();
  }
}
