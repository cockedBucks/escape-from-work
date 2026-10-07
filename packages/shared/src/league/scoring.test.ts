import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import { parseTuning } from '../config/tuning';
import { NO_COUNTS, emptyLeague, type RaceCar, type RaceRecord } from './schema';
import { bestLaps, duoTable, leagueTables, playerTable, pointsFor, weekStart } from './scoring';

const cfg = parseTuning(realTuning).league;

const car = (slot: number, place: number, names: string[], over: Partial<RaceCar> = {}): RaceCar => ({
  slot, team: `Team ${slot + 1}`, car: 'cabbie', bot: false,
  players: names.map((name, i) => ({ name, seat: names.length === 1 ? 'solo' : i === 0 ? 'pilot' : 'engineer' })),
  place, finished: true, dnf: false, finishMs: 100_000 + place * 1000, bestLapMs: 40_000 + place * 100,
  counts: { ...NO_COUNTS }, ...over,
});

const race = (at: string, cars: RaceCar[], track = 'office'): RaceRecord => ({ at, track, laps: 3, chaos: false, cars, awards: [] });

describe('points', () => {
  it('by place for finishers (config table), nothing for bots, DNFs or places past the table', () => {
    expect(pointsFor(car(0, 1, ['A']), cfg)).toBe(10);
    expect(pointsFor(car(0, 2, ['A']), cfg)).toBe(8);
    expect(pointsFor(car(0, 8, ['A']), cfg)).toBe(1);
    expect(pointsFor(car(0, 9, ['A']), cfg)).toBe(0);
    expect(pointsFor(car(0, 1, [], { bot: true }), cfg)).toBe(0);
    expect(pointsFor(car(0, 4, ['A'], { finished: false, dnf: true }), cfg)).toBe(0);
  });

  it('every human in the car scores; names match ignoring case and spaces', () => {
    const races = [
      race('2026-10-05T10:00:00+03:00', [car(0, 1, ['Dina', 'Omar']), car(1, 2, ['Sara']), car(2, 3, [], { bot: true })]),
      race('2026-10-05T11:00:00+03:00', [car(0, 1, ['sara ']), car(1, 2, ['DINA', 'Karim'])]),
    ];
    const table = playerTable(races, cfg);
    const by = Object.fromEntries(table.map((r) => [r.key, r]));
    expect(by.dina).toMatchObject({ points: 18, races: 2, wins: 1, podiums: 2, bestPlace: 1, name: 'DINA' });
    expect(by.sara).toMatchObject({ points: 18, races: 2, wins: 1 });
    expect(by.omar!.points).toBe(10);
    expect(table.some((r) => r.key === '')).toBe(false); // the bot car has nobody
    // Ties on points: more wins first, then fewer races.
    expect(table.map((r) => r.key).slice(0, 2).sort()).toEqual(['dina', 'sara']);
  });
});

describe('one person, one result per race', () => {
  it('a name in two seats (two tabs) scores once, with its best car', () => {
    const races = [race('2026-10-05T10:00:00+03:00', [car(0, 1, ['Dina', 'dina ']), car(1, 2, ['Omar']), car(2, 3, ['DINA'])])];
    const dina = playerTable(races, cfg).find((r) => r.key === 'dina')!;
    expect(dina).toMatchObject({ points: 10, races: 1, wins: 1, podiums: 1 });
  });
});

describe('week boundaries', () => {
  it('weeks start on the configured day, by the host\'s local date', () => {
    // 2026-10-04 is a Sunday.
    expect(weekStart('2026-10-04T00:00:00+03:00', 'sunday')).toBe('2026-10-04');
    expect(weekStart('2026-10-10T23:59:59+03:00', 'sunday')).toBe('2026-10-04'); // Saturday night
    expect(weekStart('2026-10-11T00:00:00+03:00', 'sunday')).toBe('2026-10-11'); // next Sunday
    expect(weekStart('2026-10-04T12:00:00+03:00', 'monday')).toBe('2026-09-28');
    expect(weekStart('2026-10-05T08:00:00+03:00', 'monday')).toBe('2026-10-05');
    // Across a month and a year.
    expect(weekStart('2027-01-01T09:00:00+03:00', 'sunday')).toBe('2026-12-27');
  });

  it('the weekly cup counts only this week\'s races', () => {
    const league = {
      ...emptyLeague(),
      races: [
        race('2026-10-03T17:00:00+03:00', [car(0, 1, ['Old'])]), // last Saturday
        race('2026-10-06T10:00:00+03:00', [car(0, 1, ['New'])]),
      ],
    };
    const t = leagueTables(league, cfg, '2026-10-07T12:00:00+03:00');
    expect(t.week.start).toBe('2026-10-04');
    expect(t.week.rows.map((r) => r.key)).toEqual(['new']);
    expect(t.allTime.map((r) => r.key).sort()).toEqual(['new', 'old']);
    expect(t.races).toBe(2);
  });
});

describe('records', () => {
  it('duos: the same pair whoever steered; two tabs of one person are not a duo', () => {
    const races = [
      race('2026-10-05T10:00:00+03:00', [car(0, 1, ['Dina', 'Omar']), car(1, 2, ['Sara', 'sara'])]),
      race('2026-10-05T11:00:00+03:00', [car(0, 3, ['Omar', 'Dina'])]),
    ];
    const duos = duoTable(races, cfg);
    expect(duos).toHaveLength(1);
    expect(duos[0]).toMatchObject({ keys: ['dina', 'omar'], races: 2, wins: 1, points: 16, bestPlace: 1 });
  });

  it('best lap per track, with the car and both names; the first one set wins a tie', () => {
    const races = [
      race('2026-10-05T10:00:00+03:00', [car(0, 1, ['Dina', 'Omar'], { bestLapMs: 41_000 })]),
      race('2026-10-05T11:00:00+03:00', [car(0, 1, ['Sara'], { bestLapMs: 41_000, car: 'hot-fix' }), car(1, 2, [], { bot: true, bestLapMs: 39_500 })], 'office'),
      race('2026-10-05T12:00:00+03:00', [car(0, 1, ['Sara'], { bestLapMs: 35_000 })], 'test-loop'),
    ];
    const laps = bestLaps(races);
    expect(laps.map((l) => [l.track, l.ms])).toEqual([['office', 39_500], ['test-loop', 35_000]]);
    expect(laps[0]!.bot).toBe(true);
    const humans = bestLaps(races.slice(0, 1));
    expect(humans[0]).toMatchObject({ car: 'cabbie', names: ['Dina', 'Omar'] });
  });
});
