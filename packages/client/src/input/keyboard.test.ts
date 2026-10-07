import { describe, expect, it, vi } from 'vitest';
import type { InputMessage } from '@escape/shared';
import { KeyboardControls, controlsFrom, isTyping } from './keyboard';

describe('controlsFrom', () => {
  it('maps held actions to the input message', () => {
    const none = { steer: 0, gas: false, brake: false, nitro: false, drift: false, fire: false, aimBack: false, respawn: false, honk: false };
    expect(controlsFrom(new Set())).toEqual(none);
    expect(controlsFrom(new Set(['gas', 'right']))).toEqual({ ...none, steer: 1, gas: true });
    expect(controlsFrom(new Set(['item', 'aimBack']))).toMatchObject({ fire: true, aimBack: true });
    expect(controlsFrom(new Set(['nitro'])).nitro).toBe(true);
    expect(controlsFrom(new Set(['honk'])).honk).toBe(true);
    expect(controlsFrom(new Set(['left', 'brake', 'respawn']))).toMatchObject({ steer: -1, brake: true, respawn: true });
  });

  it('Space drifts for the Pilot and Solo, and uses the item for the Engineer; E always uses it', () => {
    const space = new Set(['space'] as const);
    expect(controlsFrom(space, 'pilot')).toMatchObject({ drift: true, fire: false });
    expect(controlsFrom(space, 'solo')).toMatchObject({ drift: true, fire: false });
    expect(controlsFrom(space, 'engineer')).toMatchObject({ drift: false, fire: true });
    expect(controlsFrom(new Set(['item'] as const), 'solo')).toMatchObject({ drift: false, fire: true });
  });

  it('left + right together cancel out', () => {
    expect(controlsFrom(new Set(['left', 'right'])).steer).toBe(0);
  });
});

describe('isTyping', () => {
  it('text fields take keys; sliders and buttons do not (they must not stop the car)', () => {
    // Node has no DOM: stand-in classes for the instanceof checks.
    class FakeInput {
      constructor(readonly type: string) {}
    }
    class FakeTextArea {}
    const g = globalThis as Record<string, unknown>;
    const saved = { input: g.HTMLInputElement, area: g.HTMLTextAreaElement };
    g.HTMLInputElement = FakeInput;
    g.HTMLTextAreaElement = FakeTextArea;
    try {
      expect(isTyping(new FakeInput('text') as unknown as EventTarget)).toBe(true);
      expect(isTyping(new FakeTextArea() as unknown as EventTarget)).toBe(true);
      expect(isTyping(new FakeInput('range') as unknown as EventTarget)).toBe(false);
      expect(isTyping(new FakeInput('checkbox') as unknown as EventTarget)).toBe(false);
      expect(isTyping(null)).toBe(false);
    } finally {
      g.HTMLInputElement = saved.input;
      g.HTMLTextAreaElement = saved.area;
    }
  });
});

describe('KeyboardControls seat change (P13.2)', () => {
  it('Space held through a swap lane does not fire the item (or drift) until it is let go', () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    vi.stubGlobal('window', {
      setInterval: () => 1,
      clearInterval: () => {},
      addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
      removeEventListener: () => {},
    });
    const sent: InputMessage[] = [];
    const kb = new KeyboardControls((m) => sent.push(m), 100);
    kb.role = 'pilot';
    const key = (type: 'keydown' | 'keyup', code: string): void => handlers[type]!({ code, repeat: false, target: null, preventDefault: () => {} });
    key('keydown', 'Space');
    expect(sent.at(-1)).toMatchObject({ drift: true, fire: false });
    kb.role = 'engineer'; // swap lane
    expect(sent.at(-1)).toMatchObject({ drift: false, fire: false });
    key('keydown', 'Space'); // key repeat while still held
    expect(sent.at(-1)).toMatchObject({ fire: false });
    key('keyup', 'Space');
    key('keydown', 'Space');
    expect(sent.at(-1)).toMatchObject({ drift: false, fire: true });
    kb.dispose();
    vi.unstubAllGlobals();
  });
});
