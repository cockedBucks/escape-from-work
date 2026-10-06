import { describe, expect, it } from 'vitest';
import { parseHead, parseInputMessage, toCarInput } from './messages';

describe('input message', () => {
  it('accepts a full message and fills missing keys with "not pressed"', () => {
    const msg = parseInputMessage({ seq: 3, gas: true });
    expect(msg).not.toBeNull();
    expect(toCarInput(msg!)).toEqual({ steer: 0, gas: true, brake: false, respawn: false, honk: false, nitro: false, fire: false, aimBack: false });
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

describe('head message', () => {
  const limits = { headYawLimit: 1.5, headPitchLimit: 0.5 };
  it('accepts angles and clamps them to the head limits', () => {
    expect(parseHead({ yaw: 0.3, pitch: -0.2 }, limits)).toEqual({ yaw: 0.3, pitch: -0.2 });
    expect(parseHead({ yaw: 9, pitch: -9 }, limits)).toEqual({ yaw: 1.5, pitch: -0.5 });
  });

  it('drops malformed messages', () => {
    for (const bad of [null, {}, { yaw: 1 }, { yaw: 'a', pitch: 0 }, { yaw: NaN, pitch: 0 }, { yaw: 0, pitch: Infinity }, { yaw: 0, pitch: 0, x: 1 }]) {
      expect(parseHead(bad, limits)).toBeNull();
    }
  });
});
