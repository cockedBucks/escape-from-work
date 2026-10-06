// Procedural horns (GAME_DESIGN §8): every car has a goofy horn, synthesized with Web Audio,
// so there are no sound files to license. Browsers only allow sound after the player has
// clicked or pressed a key, so the audio context starts on the first input.
import type { Horn } from '@escape/shared';

interface Voice {
  type: OscillatorType;
  /** Start and end frequency (Hz): a glide makes it silly. */
  from: number;
  to: number;
}

interface HornPreset {
  voices: Voice[];
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
  /** Swap lane: a quick two-note "ta-da" (your car only). */
  swap: { voices: [{ type: 'square', from: 523, to: 784 }, { type: 'triangle', from: 1046, to: 1568 }], duration: 0.3, vibrato: 0, vibratoRate: 0, gain: 0.16 },
  /** Nitro lights: a low roaring whoosh. */
  nitro: { voices: [{ type: 'sawtooth', from: 90, to: 260 }, { type: 'square', from: 45, to: 130 }], duration: 0.6, vibrato: 20, vibratoRate: 40, gain: 0.16 },
} as const satisfies { levels: readonly HornPreset[]; boost: HornPreset; swap: HornPreset; nitro: HornPreset };

/** Items: a rising "bling" on pickup (your car), a whoosh when used, a boing on a hit, a ding when a Firewall blocks. */
export const ITEM_SOUNDS = {
  pickup: { voices: [{ type: 'triangle', from: 660, to: 1320 }], duration: 0.18, vibrato: 0, vibratoRate: 0, gain: 0.16 },
  use: { voices: [{ type: 'sawtooth', from: 900, to: 300 }], duration: 0.22, vibrato: 0, vibratoRate: 0, gain: 0.1 },
  hit: { voices: [{ type: 'square', from: 300, to: 90 }], duration: 0.45, vibrato: 18, vibratoRate: 14, gain: 0.18 },
  blocked: { voices: [{ type: 'sine', from: 1200, to: 1200 }, { type: 'sine', from: 1800, to: 1800 }], duration: 0.25, vibrato: 0, vibratoRate: 0, gain: 0.14 },
} as const satisfies Record<string, HornPreset>;

/** Distance (m) at which a horn is at half volume. */
const HALF_VOLUME_DISTANCE = 40;

/** Loudness of a horn heard from `distance` meters away (1 = right next to you). */
export const hornVolume = (distance: number): number => 1 / (1 + Math.max(0, distance) / HALF_VOLUME_DISTANCE);

export class HornPlayer {
  private ctx: AudioContext | null = null;

  /** The shared audio context (null until the first click or key press). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  constructor() {
    window.addEventListener('pointerdown', this.unlock, { once: false });
    window.addEventListener('keydown', this.unlock, { once: false });
  }

  /** Create/resume the audio context on a user gesture (browser autoplay rules). */
  private readonly unlock = (): void => {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null; // no audio on this machine: horns stay silent, the bubble still shows
    }
  };

  play(horn: Horn, distance: number): void {
    this.playSound(HORN_PRESETS[horn], distance);
  }

  /** Play any synthesized sound (horn or engine) heard from `distance` meters away. */
  playSound(p: HornPreset, distance: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    const level = p.gain * hornVolume(distance);
    // Quick attack, hold, quick release: no clicks.
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(level, t0 + 0.02);
    out.gain.setValueAtTime(level, t0 + p.duration - 0.05);
    out.gain.linearRampToValueAtTime(0, t0 + p.duration);
    out.connect(ctx.destination);
    for (const v of p.voices) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.from, t0);
      osc.frequency.linearRampToValueAtTime(v.to, t0 + p.duration);
      if (p.vibrato > 0) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = p.vibratoRate;
        depth.gain.value = p.vibrato;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(t0 + p.duration);
      }
      osc.connect(out);
      osc.start(t0);
      osc.stop(t0 + p.duration);
      // Free the nodes once the sound is over (the output gain goes with the last voice).
      osc.onended = () => {
        osc.disconnect();
        out.disconnect();
      };
    }
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    void this.ctx?.close();
  }
}
