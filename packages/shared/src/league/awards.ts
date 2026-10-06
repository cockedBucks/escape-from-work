import type { SimEvent } from '../sim/types';
import { NO_COUNTS, type CarCounts, type RaceCar, type RaceRecord } from './schema';

// Awards (GAME_DESIGN §10): counters from sim events during a race, then rules from config pick
// up to `maxAwards` winners plus the Rubber Duck of Shame for last place. Pure and tested.

export const AWARD_STATS = ['wallHits', 'brakeSeconds', 'driftBoosts', 'maxDriftLevel', 'itemHits', 'honks'] as const satisfies readonly (keyof CarCounts)[];
export type AwardStat = (typeof AWARD_STATS)[number];

/** One award rule (config): the car with the most (or fewest) of `stat` gets it. */
export interface AwardRule {
  id: string;
  title: string;
  icon: string;
  /** Short line under the title ("bounced off 9 walls"); `{n}` = the number. */
  line: string;
  stat: AwardStat;
  pick: 'most' | 'fewest';
  /** "most": at least this many; "fewest": at most this many. */
  limit: number;
  /** Only cars that finished can win it (Clean Driver: not for a car that gave up). */
  finishedOnly: boolean;
}

export const DUCK_AWARD = 'duck';

/** Fresh counters for every car in the race. */
export function newCounts(carIds: readonly string[]): Map<string, CarCounts> {
  return new Map(carIds.map((id) => [id, { ...NO_COUNTS }]));
}

/**
 * Add one tick of a race to the counters: its events, and `dt` seconds of braking for every
 * car whose applied input brakes while it is moving forward.
 */
export function countTick(
  counts: Map<string, CarCounts>,
  events: readonly SimEvent[],
  braking: ReadonlySet<string>,
  dt: number,
): void {
  for (const id of braking) {
    const c = counts.get(id);
    if (c) c.brakeSeconds += dt;
  }
  for (const e of events) {
    const id = e.type === 'itemHit' ? e.by : e.car;
    const c = counts.get(id);
    if (!c) continue;
    switch (e.type) {
      case 'wallHit':
        c.wallHits++;
        break;
      case 'driftLevel':
        c.maxDriftLevel = Math.max(c.maxDriftLevel, e.level);
        break;
      case 'boost':
        c.driftBoosts++;
        break;
      case 'itemHit':
        if (!e.blocked && e.by !== e.car) c.itemHits++;
        break;
      case 'honk':
        c.honks++;
        break;
      default:
        break;
    }
  }
}

/**
 * The awards of a race: each rule (in config order, until `maxAwards`) goes to the one car that
 * is best at its stat and passes the limit (a tie = nobody: no shared trophies). Bots are rivals
 * (a solo player racing bots can win) but never winners: a bot on top means nobody gets it.
 * Then the Rubber Duck of Shame for the last place, always (bots included).
 */
export function pickAwards(cars: readonly RaceCar[], rules: readonly AwardRule[], maxAwards: number): RaceRecord['awards'] {
  const out: RaceRecord['awards'] = [];
  for (const rule of rules) {
    if (out.length >= maxAwards) break;
    const eligible = cars.filter((c) => !rule.finishedOnly || c.finished);
    if (eligible.length < 2) continue; // an award needs a rival
    const value = (c: RaceCar): number => c.counts[rule.stat];
    const best = rule.pick === 'most' ? Math.max(...eligible.map(value)) : Math.min(...eligible.map(value));
    const winners = eligible.filter((c) => value(c) === best);
    if (winners.length !== 1 || winners[0]!.bot) continue;
    if (rule.pick === 'most' ? best < rule.limit : best > rule.limit) continue;
    out.push({ id: rule.id, slot: winners[0]!.slot });
  }
  const placed = cars.filter((c) => c.place > 0);
  const last = placed.reduce<RaceCar | undefined>((a, c) => (a === undefined || c.place > a.place ? c : a), undefined);
  if (last && placed.length > 1) out.push({ id: DUCK_AWARD, slot: last.slot });
  return out;
}

/** "{n}" in an award line → the car's number (seconds rounded). */
export function awardLine(rule: Pick<AwardRule, 'line' | 'stat'>, counts: CarCounts): string {
  const v = counts[rule.stat];
  return rule.line.replace('{n}', String(Number.isInteger(v) ? v : Math.round(v)));
}
