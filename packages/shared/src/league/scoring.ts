import { WEEKDAYS, type LeagueTuning, type Weekday } from '../config/tuning';
import { playerKey, type LeagueData, type RaceCar, type RaceRecord } from './schema';

// League tables (GAME_DESIGN §10), all computed from the race history. Pure: times come from
// the records (ISO strings with the host's offset), never from the clock.

/** Points a car earned: by place for finishers; bots and DNFs score nothing. */
export function pointsFor(car: RaceCar, cfg: LeagueTuning): number {
  if (car.bot || !car.finished || car.place < 1) return 0;
  return cfg.pointsByPlace[car.place - 1] ?? 0;
}

/** The host's local calendar date of a race time: "2026-10-06T23:30:00+03:00" → "2026-10-06". */
export const localDate = (at: string): string => at.slice(0, 10);

/** The first day ("YYYY-MM-DD") of the week a race time falls in, weeks starting on `weekStartsOn`. */
export function weekStart(at: string, weekStartsOn: Weekday): string {
  const [y, m, d] = localDate(at).split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const back = (weekday - WEEKDAYS.indexOf(weekStartsOn) + 7) % 7;
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

export interface PlayerRow {
  key: string;
  /** The spelling used most recently. */
  name: string;
  points: number;
  races: number;
  wins: number;
  podiums: number;
  /** 0 = never placed. */
  bestPlace: number;
}

/** Finished cars by place, then the rest. */
const placeRank = (car: RaceCar): number => (car.finished && car.place > 0 ? car.place : Number.MAX_SAFE_INTEGER);

const better = (a: number, b: number): number => (a === 0 ? b : b === 0 ? a : Math.min(a, b));

/** Points table over `races`: every human in a car gets the car's points. Most points first. */
export function playerTable(races: readonly RaceRecord[], cfg: LeagueTuning): PlayerRow[] {
  const rows = new Map<string, PlayerRow>();
  for (const race of races) {
    // One person, one result per race: a name in two seats (two tabs) counts once, its best car.
    const best = new Map<string, { car: RaceCar; name: string; points: number }>();
    for (const car of race.cars) {
      if (car.bot) continue;
      const points = pointsFor(car, cfg);
      for (const p of car.players) {
        const key = playerKey(p.name);
        const had = best.get(key);
        if (!had || points > had.points || (points === had.points && placeRank(car) < placeRank(had.car))) best.set(key, { car, name: p.name, points });
      }
    }
    for (const [key, { car, name, points }] of best) {
      const row = rows.get(key) ?? { key, name, points: 0, races: 0, wins: 0, podiums: 0, bestPlace: 0 };
      row.name = name.trim();
      row.points += points;
      row.races++;
      if (car.finished && car.place === 1) row.wins++;
      if (car.finished && car.place >= 1 && car.place <= 3) row.podiums++;
      if (car.finished) row.bestPlace = better(row.bestPlace, car.place);
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.races - b.races || a.key.localeCompare(b.key));
}

export interface DuoRow {
  /** The two players' keys, sorted (the same duo whoever steered). */
  keys: [string, string];
  names: [string, string];
  races: number;
  wins: number;
  points: number;
  bestPlace: number;
}

/** Best duos: two humans sharing a car. Most wins, then most points. */
export function duoTable(races: readonly RaceRecord[], cfg: LeagueTuning): DuoRow[] {
  const rows = new Map<string, DuoRow>();
  for (const race of races) {
    for (const car of race.cars) {
      if (car.bot || car.players.length !== 2) continue;
      const [a, b] = [...car.players].sort((x, y) => playerKey(x.name).localeCompare(playerKey(y.name))) as [typeof car.players[0], typeof car.players[0]];
      const keys: [string, string] = [playerKey(a.name), playerKey(b.name)];
      if (keys[0] === keys[1]) continue; // two tabs, one person
      const id = keys.join('\u0000');
      const row = rows.get(id) ?? { keys, names: [a.name, b.name] as [string, string], races: 0, wins: 0, points: 0, bestPlace: 0 };
      row.names = [a.name.trim(), b.name.trim()];
      row.races++;
      row.points += pointsFor(car, cfg);
      if (car.finished && car.place === 1) row.wins++;
      if (car.finished) row.bestPlace = better(row.bestPlace, car.place);
      rows.set(id, row);
    }
  }
  return [...rows.values()].sort((x, y) => y.wins - x.wins || y.points - x.points || x.races - y.races || x.keys.join().localeCompare(y.keys.join()));
}

export interface LapRecord {
  track: string;
  ms: number;
  /** Roster car id. */
  car: string;
  team: string;
  /** Who was in the car (empty for a bot). */
  names: string[];
  bot: boolean;
  at: string;
}

/** The fastest lap ever on each track (bots included: beat the bot!), the first one set on a tie. */
export function bestLaps(races: readonly RaceRecord[]): LapRecord[] {
  const best = new Map<string, LapRecord>();
  for (const race of races) {
    for (const car of race.cars) {
      if (car.bestLapMs <= 0) continue;
      const now = best.get(race.track);
      if (now && now.ms <= car.bestLapMs) continue;
      best.set(race.track, {
        track: race.track, ms: car.bestLapMs, car: car.car, team: car.team,
        names: car.players.map((p) => p.name.trim()), bot: car.bot, at: race.at,
      });
    }
  }
  return [...best.values()].sort((a, b) => a.track.localeCompare(b.track));
}

export interface LeagueTables {
  /** This week's cup: its first day and the table. */
  week: { start: string; rows: PlayerRow[] };
  allTime: PlayerRow[];
  duos: DuoRow[];
  laps: LapRecord[];
  races: number;
}

/** Every table for the League screen, as of `nowAt` (an ISO time from the host). */
export function leagueTables(league: Readonly<LeagueData>, cfg: LeagueTuning, nowAt: string): LeagueTables {
  const start = weekStart(nowAt, cfg.weekStartsOn);
  const thisWeek = league.races.filter((r) => weekStart(r.at, cfg.weekStartsOn) === start);
  return {
    week: { start, rows: playerTable(thisWeek, cfg) },
    allTime: playerTable(league.races, cfg),
    duos: duoTable(league.races, cfg),
    laps: bestLaps(league.races),
    races: league.races.length,
  };
}
