// Phone controller (P11.5): touch buttons → the same input messages the keyboard sends.
// A button holds its action while any finger is on it (several fingers at once are fine).
import type { InputMessage } from '@escape/shared';
import { controlsFrom, type Action } from '../input/keyboard';

export class PadControls {
  /** Fingers on each action (by pointer id), so two thumbs on one button release cleanly. */
  private readonly fingers = new Map<Action, Set<number>>();
  private seq = 0;
  /** Every touch so far: a Forced Update counts down faster when you mash. */
  private mash = 0;
  private readonly resendTimer: number;

  constructor(
    private readonly send: (msg: InputMessage) => void,
    resendMs: number,
  ) {
    // Resend now and then: a lost message never leaves a button stuck.
    this.resendTimer = window.setInterval(() => this.emit(), resendMs);
  }

  /** A finger (`pointerId`) went down on the button for `action`. */
  press(action: Action, pointerId: number): void {
    this.mash++;
    let set = this.fingers.get(action);
    if (!set) {
      set = new Set();
      this.fingers.set(action, set);
    }
    set.add(pointerId);
    this.emit();
  }

  /** The finger came off (or slid away, or the browser cancelled it). */
  release(action: Action, pointerId: number): void {
    const set = this.fingers.get(action);
    if (!set?.delete(pointerId)) return;
    this.emit();
  }

  /** Let go of everything (the page was hidden, the role changed). */
  releaseAll(): void {
    if (this.fingers.size === 0) return;
    this.fingers.clear();
    this.emit();
  }

  /** The actions held right now. */
  held(): Set<Action> {
    const out = new Set<Action>();
    for (const [action, set] of this.fingers) if (set.size > 0) out.add(action);
    return out;
  }

  private emit(): void {
    this.seq++;
    this.send({ seq: this.seq, ...controlsFrom(this.held()), mash: this.mash });
  }

  dispose(): void {
    window.clearInterval(this.resendTimer);
    this.releaseAll();
  }
}
