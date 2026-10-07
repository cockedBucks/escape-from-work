// A light procedural menu loop (P7.7) for the lobby and results: a soft arpeggio over a bass
// line, scheduled a little ahead on the audio clock. No files, so nothing to license.

/** Tempo (steps per second: eighth notes at 112 bpm) and how far ahead notes are queued (s). */
const STEPS_PER_SECOND = (112 / 60) * 2;
const LOOKAHEAD = 0.3;
const TICK_MS = 100;

/** Four bars, one chord each (MIDI notes): C, Am, F, G — cheerful office-radio stuff. */
const CHORDS = [
  [60, 64, 67, 72],
  [57, 60, 64, 69],
  [53, 57, 60, 65],
  [55, 59, 62, 67],
] as const;
/** Arpeggio order over the chord's 4 notes, 8 steps per bar. */
const ARP = [0, 1, 2, 3, 2, 1, 2, 3] as const;
export const LOOP_STEPS = CHORDS.length * ARP.length;

export interface Note {
  midi: number;
  /** Length in steps. */
  steps: number;
  voice: 'lead' | 'bass';
}

/** The notes that start on `step` of the loop (wraps). Pure, for tests. */
export function loopNotes(step: number): Note[] {
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  const bar = Math.floor(s / ARP.length);
  const inBar = s % ARP.length;
  const chord = CHORDS[bar]!;
  const notes: Note[] = [{ midi: chord[ARP[inBar]!]! + 12, steps: 1, voice: 'lead' }];
  if (inBar === 0 || inBar === 4) notes.push({ midi: chord[0]! - 24, steps: 4, voice: 'bass' });
  return notes;
}

export const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

const LEVEL = { lead: 0.07, bass: 0.09 } as const;

export class MusicLoop {
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;

  /** `context()` = the shared audio context (once unlocked); `out()` = the music volume channel. */
  constructor(
    private readonly context: () => AudioContext | null,
    private readonly out: () => AudioNode | null,
  ) {}

  /** Play or stop (call whenever the screen changes; repeated calls are cheap). */
  setPlaying(on: boolean): void {
    if (on && this.timer === null) {
      this.timer = window.setInterval(() => this.schedule(), TICK_MS);
      this.nextTime = 0;
    } else if (!on && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    const ctx = this.context();
    const dest = this.out();
    if (!ctx || !dest || ctx.state !== 'running') return;
    const stepLen = 1 / STEPS_PER_SECOND;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      for (const n of loopNotes(this.step)) this.play(ctx, dest, n, this.nextTime, n.steps * stepLen);
      this.step = (this.step + 1) % LOOP_STEPS;
      this.nextTime += stepLen;
    }
  }

  private play(ctx: AudioContext, dest: AudioNode, n: Note, t0: number, length: number): void {
    const osc = ctx.createOscillator();
    osc.type = n.voice === 'lead' ? 'triangle' : 'sine';
    osc.frequency.value = midiHz(n.midi);
    const g = ctx.createGain();
    const level = LEVEL[n.voice];
    // Plucky: fast attack, decay to nothing by the end of the note.
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + length * 0.95);
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + length);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  dispose(): void {
    this.setPlaying(false);
  }
}
