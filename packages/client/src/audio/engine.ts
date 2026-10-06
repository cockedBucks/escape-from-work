// Your car's engine hum and tire squeal (sense of speed): synthesized with Web Audio, no
// sound files. Pitch and brightness rise with speed, it gets louder on the gas and with a
// drift boost or nitro, and filtered noise squeals while drifting or braking hard. Your own
// car only, so a full room is not a wall of engines. Each car has its own voice (P7.7).
import type { Engine } from '@escape/shared';

/** Engine tone (cosmetic look-and-feel numbers). */
const ENGINE = {
  /** Pitch at standstill and added at top speed (Hz); a little more on the gas. */
  idleHz: 48,
  topHz: 120,
  gasHz: 8,
  /** Low-pass cutoff at standstill and added at top speed (Hz): faster = brighter. */
  idleCutoff: 280,
  topCutoff: 1500,
  /** Loudness: idle, extra on the gas, extra with boost or nitro. */
  idleLevel: 0.035,
  gasLevel: 0.035,
  boostLevel: 0.04,
  /** Tire squeal while drifting: band-pass center (Hz), sharpness, loudness. */
  squealHz: 2300,
  squealQ: 7,
  squealLevel: 0.05,
  /** How quickly the sound follows the car (s). */
  glide: 0.06,
  /** The second, buzzier voice: an octave up (slightly off, so it beats) and quieter. */
  highRatio: 2.01,
  highLevel: 0.3,
};

/** One car's engine voice: wave shapes, pitch and brightness (× the base), and a tremolo. */
export interface EngineVoice {
  low: OscillatorType;
  high: OscillatorType;
  pitch: number;
  highRatio: number;
  highLevel: number;
  brightness: number;
  level: number;
  /** Loudness wobble: depth 0–1, rate at standstill (Hz) and added at top speed. */
  tremolo: number;
  tremoloHz: number;
  tremoloTopHz: number;
}

const base: EngineVoice = {
  low: 'sawtooth', high: 'square', pitch: 1, highRatio: ENGINE.highRatio, highLevel: ENGINE.highLevel,
  brightness: 1, level: 1, tremolo: 0, tremoloHz: 0, tremoloTopHz: 0,
};

export const ENGINE_VOICES: Readonly<Record<Engine, EngineVoice>> = {
  buzz: base,
  // Smooth sedan: rounder waves, darker.
  hum: { ...base, low: 'triangle', high: 'sawtooth', highLevel: 0.2, brightness: 0.8 },
  // Pickup: low and heavy.
  rumble: { ...base, pitch: 0.62, highRatio: 1.5, highLevel: 0.45, brightness: 0.75, level: 1.15, tremolo: 0.25, tremoloHz: 9, tremoloTopHz: 14 },
  // Muscle car: lumpy idle that smooths out at speed.
  v8: { ...base, pitch: 0.75, highRatio: 1.49, highLevel: 0.5, brightness: 1.1, level: 1.1, tremolo: 0.45, tremoloHz: 11, tremoloTopHz: 30 },
  // Packet Loss: it keeps dropping out.
  rattle: { ...base, high: 'sawtooth', pitch: 0.9, tremolo: 0.7, tremoloHz: 5, tremoloTopHz: 9 },
  // Mini: a high whiny little engine.
  whine: { ...base, low: 'square', high: 'sine', pitch: 1.6, highRatio: 3.02, highLevel: 0.25, brightness: 1.4, level: 0.85 },
  // Wind-up beetle: putt-putt.
  putt: { ...base, low: 'square', high: 'triangle', pitch: 0.85, highLevel: 0.15, brightness: 0.7, tremolo: 0.85, tremoloHz: 7, tremoloTopHz: 22 },
  // IT van: clattery diesel.
  diesel: { ...base, pitch: 0.7, highRatio: 2.53, highLevel: 0.55, brightness: 0.9, tremolo: 0.3, tremoloHz: 13, tremoloTopHz: 20 },
};

/** The engine's pitch, brightness and loudness at `speedShare` × top speed. Pure, for tests. */
export function engineTone(speedShare: number, gas: boolean, boosting: boolean, voice: EngineVoice = base): { hz: number; cutoff: number; level: number; tremoloHz: number } {
  const s = Math.min(Math.max(speedShare, 0), 1.5);
  return {
    hz: (ENGINE.idleHz + ENGINE.topHz * s + (gas ? ENGINE.gasHz : 0)) * voice.pitch,
    cutoff: (ENGINE.idleCutoff + ENGINE.topCutoff * s) * voice.brightness,
    level: (ENGINE.idleLevel + (gas ? ENGINE.gasLevel : 0) + (boosting ? ENGINE.boostLevel : 0)) * voice.level,
    tremoloHz: voice.tremoloHz + voice.tremoloTopHz * Math.min(s, 1),
  };
}

/** Hard braking above this share of top speed squeals the tires too. */
export const SKID_MIN_SPEED_SHARE = 0.35;

/** Tires squeal while drifting, or braking hard at speed. Pure, for tests. */
export const squealing = (drifting: boolean, braking: boolean, speedShare: number): boolean =>
  drifting || (braking && speedShare >= SKID_MIN_SPEED_SHARE);

interface Nodes {
  low: OscillatorNode;
  high: OscillatorNode;
  noise: AudioBufferSourceNode;
  tremolo: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  squeal: GainNode;
  parts: AudioNode[];
}

export class EngineSound {
  private nodes: Nodes | null = null;
  private voice: EngineVoice = base;

  /**
   * `context()` gives the shared audio context once the player has clicked or pressed a key;
   * `out()` the engine volume channel.
   */
  constructor(
    private readonly context: () => AudioContext | null,
    private readonly out: () => AudioNode | null,
  ) {}

  /** Your car's engine voice (rebuilds the sound when it changes). */
  setVoice(engine: Engine): void {
    const v = ENGINE_VOICES[engine];
    if (v === this.voice) return;
    this.voice = v;
    this.dispose();
  }

  /** Call every frame. `on` = you are in a car and racing or driving. `squeal`: see `squealing`. */
  update(on: boolean, speedShare: number, gas: boolean, squeal: boolean, boosting: boolean): void {
    const ctx = this.context();
    const dest = this.out();
    if (!ctx || !dest || ctx.state !== 'running') return;
    const n = this.nodes ?? this.build(ctx, dest);
    const t = ctx.currentTime;
    const tone = engineTone(speedShare, gas, boosting, this.voice);
    n.low.frequency.setTargetAtTime(tone.hz, t, ENGINE.glide);
    n.high.frequency.setTargetAtTime(tone.hz * this.voice.highRatio, t, ENGINE.glide);
    n.tremolo.frequency.setTargetAtTime(tone.tremoloHz, t, ENGINE.glide);
    n.filter.frequency.setTargetAtTime(tone.cutoff, t, ENGINE.glide);
    n.gain.gain.setTargetAtTime(on ? tone.level : 0, t, ENGINE.glide);
    n.squeal.gain.setTargetAtTime(on && squeal ? ENGINE.squealLevel : 0, t, ENGINE.glide);
  }

  private build(ctx: AudioContext, dest: AudioNode): Nodes {
    const v = this.voice;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(dest);
    // Tremolo: a gain that wobbles between 1 - depth and 1.
    const wobble = ctx.createGain();
    wobble.gain.value = 1 - v.tremolo / 2;
    wobble.connect(gain);
    const tremolo = ctx.createOscillator();
    tremolo.type = 'square';
    tremolo.frequency.value = v.tremoloHz || 1;
    const depth = ctx.createGain();
    depth.gain.value = v.tremolo / 2;
    tremolo.connect(depth).connect(wobble.gain);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.connect(wobble);
    const low = ctx.createOscillator();
    low.type = v.low;
    low.connect(filter);
    const high = ctx.createOscillator();
    high.type = v.high;
    const highGain = ctx.createGain();
    highGain.gain.value = v.highLevel;
    high.connect(highGain).connect(filter);
    // Tire squeal: a second of looping white noise through a narrow band-pass.
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = ENGINE.squealHz;
    band.Q.value = ENGINE.squealQ;
    const squeal = ctx.createGain();
    squeal.gain.value = 0;
    src.connect(band).connect(squeal).connect(dest);
    low.start();
    high.start();
    tremolo.start();
    src.start();
    this.nodes = { low, high, noise: src, tremolo, filter, gain, squeal, parts: [wobble, depth, highGain, band] };
    return this.nodes;
  }

  dispose(): void {
    if (!this.nodes) return;
    const n = this.nodes;
    for (const o of [n.low, n.high, n.noise, n.tremolo]) {
      o.stop();
      o.disconnect();
    }
    for (const node of [n.filter, n.gain, n.squeal, ...n.parts]) node.disconnect();
    this.nodes = null;
  }
}
