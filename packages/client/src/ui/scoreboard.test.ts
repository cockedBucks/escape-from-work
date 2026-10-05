import { describe, expect, it } from 'vitest';
import { boardRows, raceTime, type BoardCar } from './scoreboard';
import { pickWatched } from './spectator';

const car = (slot: number, over: Partial<BoardCar> = {}): BoardCar => ({
  slot, place: 0, lapsDone: 0, finished: false, dnf: false, gapMs: 0, finishMs: 0, bot: false, ...over,
});
const players = [
  { name: 'Dina', slot: 0, seat: 'pilot' },
  { name: 'Omar', slot: 0, seat: 'engineer' },
  { name: 'Sara', slot: 1, seat: 'solo' },
];
const teams = ['Ctrl Freaks', '404 Not Found', 'Merge Conflict'];

describe('scoreboard rows', () => {
  it('orders by place during a race, with lap and gap', () => {
    const rows = boardRows([car(0, { place: 2, lapsDone: 1, gapMs: 1840 }), car(1, { place: 1, lapsDone: 1 })], players, teams, 3, 'racing');
    expect(rows.map((r) => r.team)).toEqual(['404 Not Found', 'Ctrl Freaks']);
    expect(rows[0]).toMatchObject({ place: '1', players: 'Sara', lap: '2/3', gap: 'leader' });
    expect(rows[1]).toMatchObject({ place: '2', players: 'Dina & Omar', gap: '+1.8s' });
  });

  it('shows finish time, FIN and DNF; bots are labelled', () => {
    const rows = boardRows(
      [car(0, { place: 1, finished: true, finishMs: 72345 }), car(2, { place: 2, dnf: true, bot: true })],
      players, teams, 3, 'results',
    );
    expect(rows[0]).toMatchObject({ lap: 'FIN', gap: '1:12.3' });
    expect(rows[1]).toMatchObject({ lap: 'DNF', players: '🤖 Bot', gap: '' });
  });

  it('in the lobby: slot order, no race columns', () => {
    const rows = boardRows([car(1), car(0)], players, teams, 3, 'lobby');
    expect(rows.map((r) => r.team)).toEqual(['Ctrl Freaks', '404 Not Found']);
    expect(rows[0]).toMatchObject({ place: '', lap: '', gap: '' });
  });

  it('formats race times', () => {
    expect(raceTime(72345)).toBe('1:12.3');
    expect(raceTime(5000)).toBe('0:05.0');
    expect(raceTime(59960)).toBe('1:00.0');
  });
});

describe('spectator pick', () => {
  it('keeps the watched car, steps through the list, wraps around', () => {
    const cars = ['car0', 'car3', 'car5'];
    expect(pickWatched(cars, null, 0)).toBe('car0');
    expect(pickWatched(cars, 'car3', 1)).toBe('car5');
    expect(pickWatched(cars, 'car5', 1)).toBe('car0');
    expect(pickWatched(cars, 'car0', -1)).toBe('car5');
    expect(pickWatched(cars, 'gone', 1)).toBe('car0');
    expect(pickWatched([], 'car0', 1)).toBeNull();
  });
});

describe('scoreboard gaps before the first checkpoint', () => {
  it('shows no gap instead of a fake tie', () => {
    const rows = boardRows([car(0, { place: 1 }), car(1, { place: 2, gapMs: 0 })], players, teams, 3, 'racing');
    expect(rows[1]!.gap).toBe('');
  });
});
