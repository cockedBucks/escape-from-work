// Your car's engine hum and tire squeal (sense of speed): synthesized with Web Audio, no
// sound files. Pitch and brightness rise with speed, it gets louder on the gas and with a
// drift boost or nitro, and filtered noise squeals while drifting. Your own car only, so a
// full room is not a wall of engines.

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
};

/** The engine's pitch, brightness and loudness at `speedShare` × top speed. Pure, for tests. */
export function engineTone(speedShare: number, gas: boolean, boosting: boolean): { hz: number; cutoff: number; level: number } {
  const s = Math.min(Math.max(speedShare, 0), 1.5);
  return {
    hz: ENGINE.idleHz + ENGINE.topHz * s + (gas ? ENGINE.gasHz : 0),
    cutoff: ENGINE.idleCutoff + ENGINE.topCutoff * s,
    level: ENGINE.idleLevel + (gas ? ENGINE.gasLevel : 0) + (boosting ? ENGINE.boostLevel : 0),
  };
}

interface Nodes {
  low: OscillatorNode;
  high: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  squeal: GainNode;
}

export class EngineSound {
  private nodes: Nodes | null = null;

  /** `context()` gives the shared audio context once the player has clicked or pressed a key. */
  constructor(private readonly context: () => AudioContext | null) {}

  /** Call every frame. `on` = you are in a car and racing or driving. */
  update(on: boolean, speedShare: number, gas: boolean, drifting: boolean, boosting: boolean): void {
    const ctx = this.context();
    if (!ctx || ctx.state !== 'running') return;
    const n = this.nodes ?? this.build(ctx);
    const t = ctx.currentTime;
    const tone = engineTone(speedShare, gas, boosting);
    n.low.frequency.setTargetAtTime(tone.hz, t, ENGINE.glide);
    n.high.frequency.setTargetAtTime(tone.hz * 2.01, t, ENGINE.glide);
    n.filter.frequency.setTargetAtTime(tone.cutoff, t, ENGINE.glide);
    n.gain.gain.setTargetAtTime(on ? tone.level : 0, t, ENGINE.glide);
    n.squeal.gain.setTargetAtTime(on && drifting ? ENGINE.squealLevel : 0, t, ENGINE.glide);
  }

  private build(ctx: AudioContext): Nodes {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.connect(gain);
    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    low.connect(filter);
    const high = ctx.createOscillator();
    high.type = 'square';
    const highGain = ctx.createGain();
    highGain.gain.value = 0.3;
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
    src.connect(band).connect(squeal).connect(ctx.destination);
    low.start();
    high.start();
    src.start();
    this.nodes = { low, high, filter, gain, squeal };
    return this.nodes;
  }

  dispose(): void {
    if (!this.nodes) return;
    this.nodes.low.stop();
    this.nodes.high.stop();
    this.nodes.gain.disconnect();
    this.nodes.squeal.disconnect();
    this.nodes = null;
  }
}
