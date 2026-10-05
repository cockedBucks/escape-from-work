// Gauges shared by the cockpit dashboard (canvas) and the chase-cam HUD (DOM): speed, lap,
// place, and slots for heat, nitro and the item (filled in by P5 and P6).

export interface GaugeValues {
  /** Ground speed (m/s). */
  speed: number;
  /** "LAP 1/3" or null outside a race. */
  lap: string | null;
  /** "2nd / 4" or null outside a race. */
  place: string | null;
  /** 0–1, null until engine heat exists (P5). */
  heat: number | null;
  /** 0–1, null until nitro exists (P5). */
  nitro: number | null;
  /** Item name, null until items exist (P6). */
  item: string | null;
}

export const kmh = (speed: number): number => Math.round(Math.abs(speed) * 3.6);

/** What the gauges show, as text (pure: tested, and compared to skip redraws). */
export function gaugeText(v: GaugeValues): { speed: string; lap: string; place: string; heat: number; nitro: number; item: string } {
  return {
    speed: String(kmh(v.speed)),
    lap: v.lap ?? '',
    place: v.place ?? '',
    heat: v.heat ?? 0,
    nitro: v.nitro ?? 0,
    item: v.item ?? '—',
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
      `<div class="g-speed"><strong>${t.speed}</strong> km/h</div>` +
      `<div class="g-bar"><span>HEAT</span><i style="width:${Math.round(t.heat * 100)}%"></i></div>` +
      `<div class="g-bar nitro"><span>NITRO</span><i style="width:${Math.round(t.nitro * 100)}%"></i></div>` +
      `<div class="g-item">ITEM <b>${t.item}</b></div>`;
  }

  dispose(): void {
    this.el.remove();
  }
}
