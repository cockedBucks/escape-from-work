import { describe, expect, it } from 'vitest';
import { RaceRecordSchema } from '@escape/shared';
import { localIso, raceRecord, type RecordInput } from './record';

const input = (over: Partial<RecordInput> = {}): RecordInput => ({
  at: '2026-10-06T15:30:00.000+03:00',
  track: 'office',
  laps: 3,
  chaos: true,
  tickMs: 1000 / 60,
  results: [
    { id: 'car1', place: 1, timeTicks: 6000, bestLapTicks: 1980, lapsDone: 3, dnf: false },
    { id: 'car0', place: 2, timeTicks: 6120, bestLapTicks: 2010, lapsDone: 3, dnf: false },
    { id: 'car2', place: 3, timeTicks: null, bestLapTicks: null, lapsDone: 2, dnf: true },
  ],
  teamNames: ['Ctrl Freaks', '404 Not Found', 'Merge Conflict'],
  carModels: ['cabbie', 'hot-fix', 'bug-report'],
  isBotSlot: (slot) => slot === 2,
  players: [
    { name: 'Dina', slot: 0, seat: 'pilot', bot: false },
    { name: ' Omar ', slot: 0, seat: 'engineer', bot: false },
    { name: 'Sara', slot: 1, seat: 'solo', bot: false },
    { name: 'Watcher', slot: -1, seat: '', bot: false },
  ],
  ...over,
});

describe('league race record', () => {
  it('records each car: team, roster car, people in it, place and times in ms', () => {
    const r = raceRecord(input())!;
    expect(() => RaceRecordSchema.parse(r)).not.toThrow();
    const [first, second, third] = r.cars;
    expect(first).toMatchObject({ slot: 1, team: '404 Not Found', car: 'hot-fix', place: 1, finished: true, finishMs: 100_000, bestLapMs: 33_000 });
    expect(first!.players).toEqual([{ name: 'Sara', seat: 'solo' }]);
    expect(second!.players.map((p) => p.name)).toEqual(['Dina', 'Omar']);
    expect(third).toMatchObject({ bot: true, players: [], dnf: true, finishMs: 0, bestLapMs: 0 });
  });

  it('networked bot clients never count as people; a bots-only race is not recorded', () => {
    const botClients = input({ players: input().players.map((p) => ({ ...p, bot: p.slot === 1 })) });
    expect(raceRecord(botClients)!.cars[0]).toMatchObject({ slot: 1, bot: true, players: [] });
    expect(raceRecord(input({ players: [] }))).toBeNull();
  });

  it('people who never typed a name drive but are not scored (the car is still not a bot)', () => {
    const r = raceRecord(input({ players: [{ name: 'Player 3', slot: 1, seat: 'solo', bot: false }, { name: 'Dina', slot: 0, seat: 'pilot', bot: false }] }))!;
    expect(r.cars[0]).toMatchObject({ slot: 1, bot: false, players: [] });
    expect(r.cars[1]!.players).toEqual([{ name: 'Dina', seat: 'pilot' }]);
  });

  it('writes the host\'s local time with its offset', () => {
    const s = localIso(new Date('2026-10-06T12:30:00.000Z'));
    expect(s).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d$/);
    expect(new Date(s).getTime()).toBe(Date.parse('2026-10-06T12:30:00.000Z'));
  });
});
