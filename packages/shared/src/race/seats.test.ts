import { describe, expect, it } from 'vitest';
import { carIdForSlot, effectiveRole, seatProblem, suggestSeat, usedSlots, type SeatedPlayer } from './seats';

const p = (id: string, slot: number, seat: SeatedPlayer['seat'], connected = true): SeatedPlayer => ({ id, slot, seat, connected });

describe('seat rules', () => {
  it('lets two players share a car as Pilot + Engineer', () => {
    const players = [p('a', 0, 'pilot')];
    expect(seatProblem(players, 'b', 0, 'engineer', 8)).toBeNull();
    expect(seatProblem(players, 'b', 0, 'pilot', 8)).toMatch(/pilot seat is taken/);
  });

  it('solo takes the whole car, and only an empty one', () => {
    expect(seatProblem([p('a', 0, 'solo')], 'b', 0, 'engineer', 8)).toMatch(/solo/);
    expect(seatProblem([p('a', 0, 'pilot')], 'b', 0, 'solo', 8)).toMatch(/already in this car/);
    expect(seatProblem([p('a', 1, 'pilot')], 'b', 0, 'solo', 8)).toBeNull();
  });

  it('a player may move within their own car (their own seat does not block them)', () => {
    const players = [p('a', 0, 'pilot')];
    expect(seatProblem(players, 'a', 0, 'engineer', 8)).toBeNull();
    expect(seatProblem(players, 'a', 0, 'solo', 8)).toBeNull();
  });

  it('rejects slots that do not exist', () => {
    expect(seatProblem([], 'a', 8, 'pilot', 8)).toMatch(/no such car/);
    expect(seatProblem([], 'a', -1, 'pilot', 8)).toMatch(/no such car/);
    expect(seatProblem([], 'a', 1.5, 'pilot', 8)).toMatch(/no such car/);
  });
});

describe('effectiveRole', () => {
  it('a lone Pilot or Engineer drives solo; a full car splits roles', () => {
    expect(effectiveRole([p('a', 0, 'pilot')], 'a')).toBe('solo');
    const full = [p('a', 0, 'pilot'), p('b', 0, 'engineer')];
    expect(effectiveRole(full, 'a')).toBe('pilot');
    expect(effectiveRole(full, 'b')).toBe('engineer');
  });

  it('a partner who disconnected leaves the other player solo', () => {
    const players = [p('a', 0, 'pilot'), p('b', 0, 'engineer', false)];
    expect(effectiveRole(players, 'a')).toBe('solo');
  });

  it('players not in a car have no role', () => {
    expect(effectiveRole([p('a', -1, null)], 'a')).toBeNull();
    expect(effectiveRole([], 'nobody')).toBeNull();
  });
});

describe('helpers', () => {
  it('usedSlots lists cars with anyone in them, in order', () => {
    expect(usedSlots([p('a', 3, 'pilot'), p('b', 1, 'solo'), p('c', 3, 'engineer'), p('d', -1, null)])).toEqual([1, 3]);
  });

  it('suggestSeat fills a half-empty car before opening a new one', () => {
    expect(suggestSeat([], 8)).toEqual({ slot: 0, seat: 'pilot' });
    expect(suggestSeat([p('a', 0, 'pilot')], 8)).toEqual({ slot: 0, seat: 'engineer' });
    expect(suggestSeat([p('a', 0, 'solo')], 8)).toEqual({ slot: 1, seat: 'pilot' });
    expect(suggestSeat([p('a', 0, 'solo')], 1)).toBeNull();
  });

  it('car ids sort in slot order', () => {
    const ids = [3, 0, 7, 1].map(carIdForSlot).sort();
    expect(ids).toEqual(['car0', 'car1', 'car3', 'car7']);
  });
});
