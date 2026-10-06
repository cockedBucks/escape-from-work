import type { CarInput, InputMessage } from '@escape/shared';

/** Solo controls (GAME_DESIGN §4), by physical key (`KeyboardEvent.code`), so any layout works. */
const KEYS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  gas: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  nitro: ['ShiftLeft', 'ShiftRight'],
  fire: ['Space'],
  aimBack: ['KeyQ'],
  respawn: ['KeyR'],
  honk: ['KeyH'],
} as const;

type Action = keyof typeof KEYS;

const ACTION_BY_CODE = new Map<string, Action>(
  (Object.entries(KEYS) as [Action, readonly string[]][]).flatMap(([action, codes]) => codes.map((c) => [c, action] as const)),
);

/** Which actions are held, as an input message body (without `seq`). */
export function controlsFrom(held: ReadonlySet<Action>): Omit<InputMessage, 'seq'> {
  return {
    steer: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
    gas: held.has('gas'),
    brake: held.has('brake'),
    nitro: held.has('nitro'),
    fire: held.has('fire'),
    aimBack: held.has('aimBack'),
    respawn: held.has('respawn'),
    honk: held.has('honk'),
  };
}

/**
 * Tracks held driving keys and calls `send` with the full control state whenever it
 * changes, and again every `resendMs`. Releases everything when the window loses focus, so gas never sticks.
 */
export class KeyboardControls {
  private readonly held = new Set<Action>();
  private seq = 0;
  private readonly resendTimer: number;

  constructor(
    private readonly send: (msg: InputMessage) => void,
    resendMs: number,
  ) {
    // Resend the held controls now and then: a lost message never leaves a key stuck.
    this.resendTimer = window.setInterval(() => this.emit(), resendMs);
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  private readonly onDown = (e: KeyboardEvent): void => {
    const action = ACTION_BY_CODE.get(e.code);
    // Typing a name in a text field must not drive the car.
    if (!action || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault(); // arrow keys must not scroll the page
    if (this.held.has(action)) return; // key repeat
    this.held.add(action);
    this.emit();
  };

  private readonly onUp = (e: KeyboardEvent): void => {
    const action = ACTION_BY_CODE.get(e.code);
    if (!action || !this.held.delete(action)) return;
    this.emit();
  };

  private readonly onBlur = (): void => {
    if (this.held.size === 0) return;
    this.held.clear();
    this.emit();
  };

  /** Write the controls held right now into `out` (per-frame safe: no allocation). */
  readInto(out: CarInput): CarInput {
    out.steer = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    out.gas = this.held.has('gas');
    out.brake = this.held.has('brake');
    out.nitro = this.held.has('nitro');
    out.fire = this.held.has('fire');
    out.aimBack = this.held.has('aimBack');
    out.respawn = this.held.has('respawn');
    out.honk = this.held.has('honk');
    return out;
  }

  private emit(): void {
    this.seq++;
    this.send({ seq: this.seq, ...controlsFrom(this.held) });
  }

  dispose(): void {
    window.clearInterval(this.resendTimer);
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
