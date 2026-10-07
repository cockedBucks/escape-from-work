// Gauges shared by the cockpit dashboard (canvas) and the chase-cam HUD (DOM): speed, lap,
// place, and slots for heat, nitro and the item (filled in by P5 and P6).
import { itemIcon } from './itemIcons';
import { itemName } from './items';
import { t as tr } from '../i18n';

export interface GaugeValues {
  /** Ground speed (m/s). */
  speed: number;
  /** "LAP 1/3" or null outside a race. */
  lap: string | null;
  /** "2nd / 4" or null outside a race. */
  place: string | null;
  /** Engine heat 0–1 (null outside a car). */
  heat: number | null;
  /** The engine is stalled (the heat bar says so). */
  stalled: boolean;
  /** 0–1, null until nitro exists (P5). */
  nitro: number | null;
  /** The held item id, or null for an empty slot. */
  item: string | null;
}

export const kmh = (speed: number): number => Math.round(Math.abs(speed) * 3.6);

/** What the gauges show, as text (pure: tested, and compared to skip redraws). */
/** Bars move in steps this small (fewer redraws; the eye cannot tell). */
const BAR_STEPS = 50;
const bar = (v: number | null): number => Math.round((v ?? 0) * BAR_STEPS) / BAR_STEPS;

export function gaugeText(v: GaugeValues): { speed: string; lap: string; place: string; heatLabel: string; heat: number; nitro: number; item: string } {
  return {
    speed: String(kmh(v.speed)),
    lap: v.lap ?? '',
    place: v.place ?? '',
    heatLabel: v.stalled ? tr('gauge.stall') : tr('gauge.heat'),
    heat: bar(v.heat),
    nitro: bar(v.nitro),
    item: v.item ? itemName(v.item) : '—',
  };
}

/** Chase-cam gauges (bottom-right DOM panel). Touches the DOM only when the text changes. */
export class GaugePanel {
  private readonly el = document.createElement('div');
  private last = '';

  constructor(parent: HTMLElement) {
    this.el.className = 'gauges';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  update(visible: boolean, v: GaugeValues): void {
    this.el.hidden = !visible;
    if (!visible) return;
    const t = gaugeText(v);
    const key = JSON.stringify(t);
    if (key === this.last) return;
    this.last = key;
    this.el.innerHTML =
      `<div class="g-speed"><strong>${t.speed}</strong> ${tr('gauge.kmh')}</div>` +
      `<div class="g-bar${v.stalled ? ' stalled' : ''}"><span>${t.heatLabel}</span><i style="width:${Math.round(t.heat * 100)}%"></i></div>` +
      `<div class="g-bar nitro"><span>${tr('gauge.nitro')}</span><i style="width:${Math.round(t.nitro * 100)}%"></i></div>` +
      `<div class="g-item">${tr('gauge.item')} ${v.item ? itemIcon(v.item) : ''}<b>${t.item}</b></div>`;
  }

  dispose(): void {
    this.el.remove();
  }
}
