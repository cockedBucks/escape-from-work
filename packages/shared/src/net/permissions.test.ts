import { describe, expect, it } from 'vitest';
import type { CarInput } from '../sim/types';
import { mergeCarInput } from './permissions';

const everything: CarInput = { steer: 1, gas: true, brake: true, respawn: false };
const nothing: CarInput = { steer: 0, gas: false, brake: false, respawn: false };

describe('mergeCarInput', () => {
  it('the Pilot cannot throttle or brake', () => {
    expect(mergeCarInput([{ role: 'pilot', input: everything }])).toEqual({ steer: 1, gas: false, brake: false, respawn: false });
  });

  it('the Engineer cannot steer', () => {
    expect(mergeCarInput([{ role: 'engineer', input: everything }])).toEqual({ steer: 0, gas: true, brake: true, respawn: false });
  });

  it('solo gets every control', () => {
    expect(mergeCarInput([{ role: 'solo', input: everything }])).toEqual(everything);
  });

  it('Pilot + Engineer together make one full input', () => {
    const merged = mergeCarInput([
      { role: 'pilot', input: { steer: -1, gas: true, brake: false, respawn: false } },
      { role: 'engineer', input: { steer: 1, gas: true, brake: false, respawn: false } },
    ]);
    expect(merged).toEqual({ steer: -1, gas: true, brake: false, respawn: false });
  });

  it('either player may respawn the car', () => {
    expect(mergeCarInput([{ role: 'pilot', input: nothing }, { role: 'engineer', input: { ...nothing, respawn: true } }]).respawn).toBe(true);
    expect(mergeCarInput([{ role: 'pilot', input: { ...nothing, respawn: true } }, { role: 'engineer', input: nothing }]).respawn).toBe(true);
  });

  it('no players = no input', () => {
    expect(mergeCarInput([])).toEqual(nothing);
  });
});
