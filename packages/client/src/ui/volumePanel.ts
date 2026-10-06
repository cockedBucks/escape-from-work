import { VOLUME_KEYS, type Volumes } from '../audio/mixer';

const LABELS: Record<(typeof VOLUME_KEYS)[number], string> = { master: 'Master', engine: 'Engine', sfx: 'Effects', music: 'Music' };

/**
 * A small speaker button (top right) that opens four volume sliders. P8.2's settings screen
 * reuses the same levels.
 */
export class VolumePanel {
  private readonly root = document.createElement('div');
  private readonly button = document.createElement('button');
  private readonly panel = document.createElement('div');
  private vol: Volumes;

  constructor(parent: HTMLElement, volumes: Volumes, private readonly onChange: (v: Volumes) => void) {
    this.vol = { ...volumes };
    this.root.className = 'volume';
    this.button.type = 'button';
    this.button.className = 'volume-button';
    this.button.title = 'Sound volume';
    this.panel.className = 'volume-panel';
    this.panel.hidden = true;
    for (const key of VOLUME_KEYS) {
      const label = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = LABELS[key];
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = String(Math.round(this.vol[key] * 100));
      slider.dataset.key = key;
      slider.addEventListener('input', () => {
        this.vol = { ...this.vol, [key]: Number(slider.value) / 100 };
        this.onChange(this.vol);
        this.paint();
      });
      label.append(name, slider);
      this.panel.appendChild(label);
    }
    this.button.addEventListener('click', (e) => {
      e.stopPropagation(); // not a click on the game (pointer lock)
      this.panel.hidden = !this.panel.hidden;
    });
    this.panel.addEventListener('click', (e) => e.stopPropagation());
    this.root.append(this.button, this.panel);
    parent.appendChild(this.root);
    this.paint();
  }

  private paint(): void {
    this.button.textContent = this.vol.master === 0 ? '🔇' : '🔊';
  }

  dispose(): void {
    this.root.remove();
  }
}
