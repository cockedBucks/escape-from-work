// Volume channels (P7.7): every sound goes to the engine, effects or music channel, and all
// three to master. Levels are 0–1, remembered per browser (they are personal, not game config).

export type Bus = 'engine' | 'sfx' | 'music';

export interface Volumes {
  master: number;
  engine: number;
  sfx: number;
  music: number;
}

export const VOLUME_KEYS = ['master', 'engine', 'sfx', 'music'] as const satisfies readonly (keyof Volumes)[];

export const DEFAULT_VOLUMES: Readonly<Volumes> = { master: 0.8, engine: 0.8, sfx: 0.9, music: 0.5 };

const STORAGE_KEY = 'efw.volumes';

const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : fallback;

/** Saved levels, with defaults for anything missing or broken. */
export function parseVolumes(raw: string | null): Volumes {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
  } catch {
    // corrupt: defaults
  }
  const out = { ...DEFAULT_VOLUMES };
  for (const k of VOLUME_KEYS) out[k] = clamp01(data[k], DEFAULT_VOLUMES[k]);
  return out;
}

export function loadVolumes(): Volumes {
  try {
    return parseVolumes(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_VOLUMES }; // storage blocked (private window)
  }
}

export function saveVolumes(v: Volumes): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // storage blocked: the levels still apply until the page reloads
  }
}

/** The channel gain nodes of one audio context. */
export class Mixer {
  private readonly master: GainNode;
  private readonly buses: Record<Bus, GainNode>;

  constructor(ctx: AudioContext, volumes: Volumes) {
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const bus = (): GainNode => {
      const g = ctx.createGain();
      g.connect(this.master);
      return g;
    };
    this.buses = { engine: bus(), sfx: bus(), music: bus() };
    this.set(volumes);
  }

  /** Where a sound on `bus` connects. */
  input(bus: Bus): AudioNode {
    return this.buses[bus];
  }

  set(v: Volumes): void {
    this.master.gain.value = v.master;
    this.buses.engine.gain.value = v.engine;
    this.buses.sfx.gain.value = v.sfx;
    this.buses.music.gain.value = v.music;
  }
}
