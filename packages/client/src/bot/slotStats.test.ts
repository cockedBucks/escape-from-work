import { describe, expect, it } from 'vitest';
import realCars from '../../../../config/cars.json';
import { parseCars } from '@escape/shared';
import { slotStats } from './netBot';

const roster = parseCars(realCars).cars;

describe('network bots plan with their own car', () => {
  it("uses the team's pick for the slot", () => {
    const models = ['help-desk', 'pocket-rocket'];
    expect(slotStats(roster, models, 1)).toEqual(roster.find((d) => d.id === 'pocket-rocket')!.stats);
  });

  it('falls back to roster car N (the server default) before the pick is synced', () => {
    expect(slotStats(roster, undefined, 3)).toEqual(roster[3]!.stats);
    expect(slotStats(roster, ['nope'], 0)).toEqual(roster[0]!.stats);
  });
});
