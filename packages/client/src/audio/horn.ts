// Procedural horns (GAME_DESIGN §8): every car has a goofy horn, synthesized with Web Audio,
// so there are no sound files to license. Browsers only allow sound after the player has
// clicked or pressed a key, so the audio context starts on the first input.
import type { Horn } from '@escape/shared';
import { loadVolumes, Mixer, saveVolumes, type Bus, type Volumes } from './mixer';

interface Voice {
  type: OscillatorType;
  /** Start and end frequency (Hz): a glide makes it silly. */
  from: number;
  to: number;
}

/** A burst of filtered white noise (thuds, thumps): low-pass cutoff glides from → to (Hz). */
interface NoiseBurst {
  from: number;
  to: number;
  /** Loudness relative to the preset's gain. */
  level: number;
}

export interface HornPreset {
  voices: Voice[];
  noise?: NoiseBurst;
  /** Length (s). */
  duration: number;
  /** Vibrato depth (Hz) and speed (Hz); 0 = none. */
  vibrato: number;
  vibratoRate: number;
  /** Overall loudness (0–1) before distance. */
  gain: number;
}

export const HORN_PRESETS: Readonly<Record<Horn, HornPreset>> = {
  toot: { voices: [{ type: 'square', from: 392, to: 392 }, { type: 'square', from: 494, to: 494 }], duration: 0.35, vibrato: 0, vibratoRate: 0, gain: 0.18 },
  duck: { voices: [{ type: 'sawtooth', from: 620, to: 340 }], duration: 0.22, vibrato: 30, vibratoRate: 28, gain: 0.22 },
  truck: { voices: [{ type: 'sawtooth', from: 175, to: 170 }, { type: 'sawtooth', from: 220, to: 214 }], duration: 0.65, vibrato: 0, vibratoRate: 0, gain: 0.2 },
  clown: { voices: [{ type: 'triangle', from: 700, to: 1300 }], duration: 0.3, vibrato: 60, vibratoRate: 18, gain: 0.3 },
  bike: { voices: [{ type: 'sine', from: 2100, to: 2050 }], duration: 0.5, vibrato: 25, vibratoRate: 30, gain: 0.25 },
  kazoo: { voices: [{ type: 'sawtooth', from: 300, to: 320 }], duration: 0.45, vibrato: 18, vibratoRate: 7, gain: 0.2 },
  // IT support van: a fake two-tone siren (a slow wide vibrato).
  siren: { voices: [{ type: 'square', from: 700, to: 700 }], duration: 0.7, vibrato: 160, vibratoRate: 3, gain: 0.14 },
  // Wind-up beetle: a rubber-toy squeak that rises.
  squeak: { voices: [{ type: 'sine', from: 1400, to: 2600 }], duration: 0.16, vibrato: 0, vibratoRate: 0, gain: 0.22 },
};

/** Engine sounds, made the same way: a sad sinking "waaah" when it stalls, a cough on restart. */
export const ENGINE_SOUNDS = {
  stall: { voices: [{ type: 'sawtooth', from: 233, to: 98 }, { type: 'triangle', from: 117, to: 49 }], duration: 1.1, vibrato: 7, vibratoRate: 6, gain: 0.2 },
  restart: { voices: [{ type: 'square', from: 70, to: 150 }], duration: 0.35, vibrato: 25, vibratoRate: 22, gain: 0.16 },
} as const satisfies Record<string, HornPreset>;

/** Drift: a ding per spark level (higher each time; your car only) and a whoosh on the boost. */
export const DRIFT_SOUNDS = {
  levels: [
    { voices: [{ type: 'triangle', from: 523, to: 523 }], duration: 0.12, vibrato: 0, vibratoRate: 0, gain: 0.18 },
    { voices: [{ type: 'triangle', from: 659, to: 659 }], duration: 0.12, vibrato: 0, vibratoRate: 0, gain: 0.18 },
    { voices: [{ type: 'triangle', from: 784, to: 784 }, { type: 'triangle', from: 1568, to: 1568 }], duration: 0.18, vibrato: 0, vibratoRate: 0, gain: 0.18 },
  ],
  boost: { voices: [{ type: 'sawtooth', from: 160, to: 620 }], duration: 0.4, vibrato: 12, vibratoRate: 30, gain: 0.14 },
  /** Kart drift starts (P13.2): a springy "boing" hop and a tire chirp. */
  hop: { voices: [{ type: 'sine', from: 260, to: 520 }], noise: { from: 3000, to: 1200, level: 0.4 }, duration: 0.14, vibrato: 0, vibratoRate: 0, gain: 0.14 },
  /** Swap lane: a quick two-note "ta-da" (your car only). */
  swap: { voices: [{ type: 'square', from: 523, to: 784 }, { type: 'triangle', from: 1046, to: 1568 }], duration: 0.3, vibrato: 0, vibratoRate: 0, gain: 0.16 },
  /** Nitro lights: a low roaring whoosh. */
  nitro: { voices: [{ type: 'sawtooth', from: 90, to: 260 }, { type: 'square', from: 45, to: 130 }], duration: 0.6, vibrato: 20, vibratoRate: 40, gain: 0.16 },
} as const satisfies { levels: readonly HornPreset[]; boost: HornPreset; hop: HornPreset; swap: HornPreset; nitro: HornPreset };

/** Items: a rising "bling" on pickup (your car), a whoosh when used, a boing on a hit, a ding when a Firewall blocks. */
export const ITEM_SOUNDS = {
  pickup: { voices: [{ type: 'triangle', from: 660, to: 1320 }], duration: 0.18, vibrato: 0, vibratoRate: 0, gain: 0.16 },
  use: { voices: [{ type: 'sawtooth', from: 900, to: 300 }], duration: 0.22, vibrato: 0, vibratoRate: 0, gain: 0.1 },
  hit: { voices: [{ type: 'square', from: 300, to: 90 }], duration: 0.45, vibrato: 18, vibratoRate: 14, gain: 0.18 },
  blocked: { voices: [{ type: 'sine', from: 1200, to: 1200 }, { type: 'sine', from: 1800, to: 1800 }], duration: 0.25, vibrato: 0, vibratoRate: 0, gain: 0.14 },
} as const satisfies Record<string, HornPreset>;

/** Bumps and landings (every car, quieter far away): a thud, a bonk, a thump. Louder for harder hits. */
export const IMPACT_SOUNDS = {
  wall: { voices: [{ type: 'sine', from: 110, to: 55 }], noise: { from: 900, to: 150, level: 0.9 }, duration: 0.2, vibrato: 0, vibratoRate: 0, gain: 0.22 },
  bump: { voices: [{ type: 'square', from: 210, to: 120 }], noise: { from: 1400, to: 300, level: 0.5 }, duration: 0.16, vibrato: 0, vibratoRate: 0, gain: 0.16 },
  land: { voices: [{ type: 'sine', from: 80, to: 38 }], noise: { from: 500, to: 90, level: 0.7 }, duration: 0.28, vibrato: 0, vibratoRate: 0, gain: 0.24 },
} as const satisfies Record<string, HornPreset>;

/** Hits slower than this (m/s) make no sound; at `IMPACT_LOUD` they are at full volume. */
export const IMPACT_QUIET = 2;
export const IMPACT_LOUD = 18;

/** How loud an impact sound plays (0–1) for a hit at `speed` m/s. */
export const impactLevel = (speed: number): number =>
  speed <= IMPACT_QUIET ? 0 : Math.min((speed - IMPACT_QUIET) / (IMPACT_LOUD - IMPACT_QUIET), 1) * 0.7 + 0.3;

/** Countdown: a beep for 3, 2, 1 and a higher, longer one for GO. */
export const COUNTDOWN_SOUNDS = {
  beep: { voices: [{ type: 'square', from: 440, to: 440 }, { type: 'sine', from: 880, to: 880 }], duration: 0.16, vibrato: 0, vibratoRate: 0, gain: 0.14 },
  go: { voices: [{ type: 'square', from: 880, to: 880 }, { type: 'sine', from: 1760, to: 1760 }], duration: 0.5, vibrato: 0, vibratoRate: 0, gain: 0.16 },
} as const satisfies Record<string, HornPreset>;

/** Distance (m) at which a horn is at half volume. */
const HALF_VOLUME_DISTANCE = 40;

/** Loudness of a horn heard from `distance` meters away (1 = right next to you). */
export const hornVolume = (distance: number): number => 1 / (1 + Math.max(0, distance) / HALF_VOLUME_DISTANCE);

export class HornPlayer {
  private ctx: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private vol: Volumes = loadVolumes();

  /** The shared audio context (null until the first click or key press). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Where a sound on `bus` connects (null until audio is unlocked). */
  bus(bus: Bus): AudioNode | null {
    return this.mixer?.input(bus) ?? null;
  }

  get volumes(): Volumes {
    return { ...this.vol };
  }

  /** Change and remember the volume levels. */
  setVolumes(v: Volumes): void {
    this.vol = { ...v };
    saveVolumes(this.vol);
    this.mixer?.set(this.vol);
  }

  constructor() {
    window.addEventListener('pointerdown', this.unlock, { once: false });
    window.addEventListener('keydown', this.unlock, { once: false });
  }

  /** Create/resume the audio context on a user gesture (browser autoplay rules). */
  private readonly unlock = (): void => {
    try {
      this.ctx ??= new AudioContext();
      this.mixer ??= new Mixer(this.ctx, this.vol);
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null; // no audio on this machine: horns stay silent, the bubble still shows
    }
  };

  play(horn: Horn, distance: number): void {
    this.playSound(HORN_PRESETS[horn], distance);
  }

  /** Play any synthesized sound heard from `distance` meters away, on `bus`, `loudness` × its gain. */
  playSound(p: HornPreset, distance: number, bus: Bus = 'sfx', loudness = 1): void {
    const ctx = this.ctx;
    const dest = this.mixer?.input(bus);
    if (!ctx || !dest || ctx.state !== 'running' || loudness <= 0) return;
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    const level = p.gain * hornVolume(distance) * loudness;
    // Quick attack, hold, quick release: no clicks.
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(level, t0 + 0.02);
    out.gain.setValueAtTime(level, t0 + p.duration - 0.05);
    out.gain.linearRampToValueAtTime(0, t0 + p.duration);
    out.connect(dest);
    if (p.noise) this.noiseBurst(ctx, p.noise, p.duration, out, t0);
    for (const v of p.voices) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.from, t0);
      osc.frequency.linearRampToValueAtTime(v.to, t0 + p.duration);
      let vibrato: AudioNode[] = [];
      if (p.vibrato > 0) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = p.vibratoRate;
        depth.gain.value = p.vibrato;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(t0 + p.duration);
        vibrato = [lfo, depth];
      }
      osc.connect(out);
      osc.start(t0);
      osc.stop(t0 + p.duration);
      // Free the nodes once the sound is over (the output gain goes with the last voice).
      osc.onended = () => {
        osc.disconnect();
        for (const node of vibrato) node.disconnect();
        out.disconnect();
      };
    }
  }

  /** Filtered white noise into `out` for `duration` s (shared 1 s noise buffer). */
  private noiseBurst(ctx: AudioContext, n: NoiseBurst, duration: number, out: AudioNode, t0: number): void {
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(n.from, t0);
    filter.frequency.exponentialRampToValueAtTime(n.to, t0 + duration);
    const g = ctx.createGain();
    g.gain.value = n.level;
    src.connect(filter).connect(g).connect(out);
    src.start(t0);
    src.stop(t0 + duration);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    void this.ctx?.close();
  }
}
