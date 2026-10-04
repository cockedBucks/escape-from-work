import { describe, expect, it } from 'vitest';
import { parseInputMessage, toCarInput } from './messages';

describe('input message', () => {
  it('accepts a full message and fills missing keys with "not pressed"', () => {
    const msg = parseInputMessage({ seq: 3, gas: true });
    expect(msg).not.toBeNull();
    expect(toCarInput(msg!)).toEqual({ steer: 0, gas: true, brake: false, respawn: false });
  });

  it('clamps steer instead of rejecting it', () => {
    expect(toCarInput(parseInputMessage({ seq: 1, steer: 5 })!).steer).toBe(1);
    expect(toCarInput(parseInputMessage({ seq: 1, steer: -2 })!).steer).toBe(-1);
  });

  it('drops malformed messages', () => {
    for (const bad of [
      null,
      'gas',
      {},
      { seq: -1 },
      { seq: 1.5 },
      { seq: 1, steer: Number.NaN },
      { seq: 1, steer: Infinity },
      { seq: 1, gas: 'yes' },
      { seq: 1, x: 100 }, // a client may never send positions
    ]) {
      expect(parseInputMessage(bad)).toBeNull();
    }
  });
});
