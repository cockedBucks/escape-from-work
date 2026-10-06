import { z } from 'zod';

// League data (GAME_DESIGN §10, ARCHITECTURE §8): `data/league.json` on the host PC. It keeps the
// history of finished races; every table (points, weekly cup, duos, best laps) is computed from
// it, so totals can never drift from the races they came from. Bump LEAGUE_VERSION and add a
// migration in the server store when the format changes.

export const LEAGUE_VERSION = 1;

const nonNeg = () => z.number().min(0);

/** A human in a car for that race. Bots have no players. */
const RacePlayerSchema = z.strictObject({
  name: z.string().min(1).max(40),
  seat: z.enum(['pilot', 'engineer', 'solo']),
});

/** What happened in a car, counted from sim events (awards, P9.3). */
const CarCountsSchema = z.strictObject({
  wallHits: z.number().int().min(0),
  brakeSeconds: nonNeg(),
  driftBoosts: z.number().int().min(0),
  /** Highest drift spark level reached (0–3). */
  maxDriftLevel: z.number().int().min(0),
  itemHits: z.number().int().min(0),
  honks: z.number().int().min(0),
});

const RaceCarSchema = z.strictObject({
  slot: z.number().int().min(0),
  team: z.string(),
  /** Roster car id (cars.json). */
  car: z.string(),
  bot: z.boolean(),
  players: z.array(RacePlayerSchema),
  /** 1 = winner; 0 = no place (left). */
  place: z.number().int().min(0),
  finished: z.boolean(),
  dnf: z.boolean(),
  finishMs: nonNeg(),
  bestLapMs: nonNeg(),
  counts: CarCountsSchema,
});

/** An award given at the end of a race (P9.3). */
const AwardSchema = z.strictObject({
  id: z.string().min(1),
  slot: z.number().int().min(0),
});

export const RaceRecordSchema = z.strictObject({
  /** When the race ended (ISO 8601, the host PC's clock). */
  at: z.iso.datetime({ offset: true }),
  track: z.string().min(1),
  laps: z.number().int().min(1),
  chaos: z.boolean(),
  cars: z.array(RaceCarSchema),
  awards: z.array(AwardSchema),
});

export const LeagueSchema = z.strictObject({
  version: z.literal(LEAGUE_VERSION),
  races: z.array(RaceRecordSchema),
});

export type LeagueData = z.infer<typeof LeagueSchema>;
export type RaceRecord = z.infer<typeof RaceRecordSchema>;
export type RaceCar = RaceRecord['cars'][number];
export type RacePlayer = RaceCar['players'][number];
export type CarCounts = RaceCar['counts'];

export const emptyLeague = (): LeagueData => ({ version: LEAGUE_VERSION, races: [] });

export const NO_COUNTS: Readonly<CarCounts> = { wallHits: 0, brakeSeconds: 0, driftBoosts: 0, maxDriftLevel: 0, itemHits: 0, honks: 0 };

/** Players are the same person when their names match ignoring case and outer spaces. */
export const playerKey = (name: string): string => name.trim().toLocaleLowerCase();
