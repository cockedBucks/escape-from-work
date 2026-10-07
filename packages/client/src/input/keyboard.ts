import type { CarInput, InputMessage, Role } from '@escape/shared';

/**
 * Controls (GAME_DESIGN §4), by physical key (`KeyboardEvent.code`), so any layout works.
 * Space is each role's big button (P13.2): the Pilot (and Solo) drifts with it, the Engineer
 * uses the item. Solo uses items with E (Engineers may use E too).
 */
const KEYS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  gas: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  nitro: ['ShiftLeft', 'ShiftRight'],
  space: ['Space'],
  item: ['KeyE'],
  aimBack: ['KeyQ'],
  respawn: ['KeyR'],
  honk: ['KeyH'],
} as const;

export type Action = keyof typeof KEYS;

const ACTION_BY_CODE = new Map<string, Action>(
  (Object.entries(KEYS) as [Action, readonly string[]][]).flatMap(([action, codes]) => codes.map((c) => [c, action] as const)),
);

/** Space drifts for everyone but the Engineer, who uses the item with it. */
const spaceDrifts = (role: Role | null): boolean => role !== 'engineer';

/** Which actions are held, as an input message body (without `seq`), for your seat. */
export function controlsFrom(held: ReadonlySet<Action>, role: Role | null = null): Omit<InputMessage, 'seq'> {
  const space = held.has('space');
  return {
    steer: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
    gas: held.has('gas'),
    brake: held.has('brake'),
    nitro: held.has('nitro'),
    drift: space && spaceDrifts(role),
    fire: held.has('item') || (space && !spaceDrifts(role)),
    aimBack: held.has('aimBack'),
    respawn: held.has('respawn'),
    honk: held.has('honk'),
  };
}

/**
 * Tracks held driving keys and calls `send` with the full control state whenever it
 * changes, and again every `resendMs`. Releases everything when the window loses focus, so gas never sticks.
 */
/** Input types that take typed text; sliders, checkboxes and buttons do not. */
const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file']);

/** Is the key going into a text field (so it is typing, not driving)? */
export function isTyping(target: EventTarget | null): boolean {
  if (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement) return true;
  return typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

export class KeyboardControls {
  private readonly held = new Set<Action>();
  private seq = 0;
  /** Every key press so far (any key): a Forced Update counts down faster when you mash. */
  private mash = 0;
  private readonly resendTimer: number;
  private seat: Role | null = null;

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

  /** Your seat: what Space does depends on it (a swap lane changes it mid-race). */
  set role(role: Role | null) {
    if (role === this.seat) return;
    this.seat = role;
    if (this.held.size > 0) this.emit();
  }

  private readonly onDown = (e: KeyboardEvent): void => {
    // Typing a name in a text field must not drive the car (a focused slider or button must not stop it).
    if (isTyping(e.target)) return;
    const action = ACTION_BY_CODE.get(e.code);
    if (!action) {
      // Any other key still counts as mashing (Forced Update).
      if (!e.repeat) {
        this.mash++;
        this.emit();
      }
      return;
    }
    e.preventDefault(); // arrow keys must not scroll the page
    if (!e.repeat) this.mash++;
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
    const space = this.held.has('space');
    out.drift = space && spaceDrifts(this.seat);
    out.fire = this.held.has('item') || (space && !spaceDrifts(this.seat));
    out.aimBack = this.held.has('aimBack');
    out.respawn = this.held.has('respawn');
    out.honk = this.held.has('honk');
    return out;
  }

  private emit(): void {
    this.seq++;
    this.send({ seq: this.seq, ...controlsFrom(this.held, this.seat), mash: this.mash });
  }

  dispose(): void {
    window.clearInterval(this.resendTimer);
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
