import { describe, expect, it } from 'vitest';
import { controlsFrom } from './keyboard';

describe('controlsFrom', () => {
  it('maps held actions to the input message', () => {
    expect(controlsFrom(new Set())).toEqual({ steer: 0, gas: false, brake: false, nitro: false, respawn: false, honk: false });
    expect(controlsFrom(new Set(['gas', 'right']))).toEqual({ steer: 1, gas: true, brake: false, nitro: false, respawn: false, honk: false });
    expect(controlsFrom(new Set(['nitro'])).nitro).toBe(true);
    expect(controlsFrom(new Set(['honk'])).honk).toBe(true);
    expect(controlsFrom(new Set(['left', 'brake', 'respawn']))).toMatchObject({ steer: -1, brake: true, respawn: true });
  });

  it('left + right together cancel out', () => {
    expect(controlsFrom(new Set(['left', 'right'])).steer).toBe(0);
  });
});
