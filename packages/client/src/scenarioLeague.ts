// Made-up league data for the `results` and `league` screenshot scenarios.
import { NO_COUNTS, type CarCounts, type LeagueTables, type RaceCar, type RaceRecord } from '@escape/shared';

const car = (slot: number, place: number, names: string[], counts: Partial<CarCounts>, over: Partial<RaceCar> = {}): RaceCar => ({
  slot, team: '', car: 'cabbie', bot: names.length === 0,
  players: names.map((name, i) => ({ name, seat: names.length === 1 ? 'solo' : i === 0 ? 'pilot' : 'engineer' })),
  place, finished: true, dnf: false, finishMs: 100_000, bestLapMs: 35_000, counts: { ...NO_COUNTS, ...counts }, ...over,
});

/** The record of the made-up race in the `results` scenario (same places as its cars). */
export const FAKE_RECORD: RaceRecord = {
  at: '2026-10-06T17:45:00.000+03:00',
  track: 'office',
  laps: 3,
  chaos: true,
  cars: [
    car(1, 1, ['Omar', 'Karim'], { wallHits: 9, driftBoosts: 2 }),
    car(0, 2, ['You', 'Dina'], { driftBoosts: 6, wallHits: 2 }),
    car(2, 3, ['Sara'], { itemHits: 3, wallHits: 1 }),
    car(4, 4, [], { wallHits: 4 }, { bot: true }),
    car(3, 5, ['Youssef'], { honks: 14 }, { finished: false, dnf: true }),
  ],
  awards: [
    { id: 'wallHugger', slot: 1 },
    { id: 'itemSniper', slot: 2 },
    { id: 'driftKing', slot: 0 },
    { id: 'duck', slot: 3 },
  ],
};

const row = (name: string, points: number, races: number, wins: number, podiums: number, bestPlace: number) => ({
  key: name.toLowerCase(), name, points, races, wins, podiums, bestPlace,
});

/** Made-up tables for the `league` scenario. */
export const FAKE_TABLES: LeagueTables = {
  week: {
    start: '2026-10-04',
    rows: [row('Dina', 46, 6, 2, 5, 1), row('Omar', 44, 6, 2, 4, 1), row('Sara', 31, 5, 1, 3, 1), row('Karim', 22, 4, 0, 2, 2), row('Youssef', 9, 3, 0, 0, 5)],
  },
  allTime: [row('Omar', 212, 31, 9, 20, 1), row('Dina', 198, 29, 8, 19, 1), row('Sara', 160, 27, 5, 13, 1), row('Karim', 101, 20, 2, 9, 1), row('Youssef', 64, 18, 1, 4, 1), row('Lina', 40, 9, 1, 3, 1)],
  duos: [
    { keys: ['dina', 'omar'], names: ['Dina', 'Omar'], races: 12, wins: 6, points: 98, bestPlace: 1 },
    { keys: ['karim', 'sara'], names: ['Karim', 'Sara'], races: 7, wins: 2, points: 51, bestPlace: 1 },
    { keys: ['lina', 'youssef'], names: ['Lina', 'Youssef'], races: 5, wins: 0, points: 22, bestPlace: 3 },
  ],
  laps: [
    { track: 'office', ms: 38_420, car: 'hot-fix', team: 'Ctrl Freaks', names: ['Sara', 'Karim'], bot: false, at: '2026-10-05T12:10:00.000+03:00' },
    { track: 'test-loop', ms: 33_910, car: 'cabbie', team: '404 Not Found', names: [], bot: true, at: '2026-10-02T09:00:00.000+03:00' },
  ],
  races: 64,
};
