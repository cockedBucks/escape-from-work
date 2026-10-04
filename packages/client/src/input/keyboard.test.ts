import { describe, expect, it } from 'vitest';
import { controlsFrom } from './keyboard';

describe('controlsFrom', () => {
  it('maps held actions to the input message', () => {
    expect(controlsFrom(new Set())).toEqual({ steer: 0, gas: false, brake: false, respawn: false });
    expect(controlsFrom(new Set(['gas', 'right']))).toEqual({ steer: 1, gas: true, brake: false, respawn: false });
    expect(controlsFrom(new Set(['left', 'brake', 'respawn']))).toMatchObject({ steer: -1, brake: true, respawn: true });
  });

  it('left + right together cancel out', () => {
    expect(controlsFrom(new Set(['left', 'right'])).steer).toBe(0);
  });
});
