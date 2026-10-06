import { describe, expect, it } from 'vitest';
import { awardLine, countTick, DUCK_AWARD, newCounts, pickAwards, type AwardRule } from './awards';
import { NO_COUNTS, type CarCounts, type RaceCar } from './schema';

const rule = (over: Partial<AwardRule>): AwardRule => ({
  id: 'wallHugger', title: 'Wall Hugger', icon: '🧱', line: 'bounced off {n} walls', stat: 'wallHits', pick: 'most', limit: 3, finishedOnly: false, ...over,
});

const car = (slot: number, place: number, counts: Partial<CarCounts>, over: Partial<RaceCar> = {}): RaceCar => ({
  slot, team: `T${slot}`, car: 'cabbie', bot: false, players: [{ name: `P${slot}`, seat: 'solo' }],
  place, finished: true, dnf: false, finishMs: 1, bestLapMs: 1, counts: { ...NO_COUNTS, ...counts }, ...over,
});

describe('award counters', () => {
  it('count wall hits, drift boosts and best level, item hits (by the shooter, not blocked), honks and brake time', () => {
    const counts = newCounts(['car0', 'car1']);
    countTick(counts, [
      { type: 'wallHit', car: 'car0', speed: 9 },
      { type: 'wallHit', car: 'car0', speed: 5 },
      { type: 'driftLevel', car: 'car1', level: 2 },
      { type: 'driftLevel', car: 'car1', level: 1 },
      { type: 'boost', car: 'car1', level: 2 },
      { type: 'itemHit', car: 'car0', item: 'replyAll', by: 'car1', blocked: false },
      { type: 'itemHit', car: 'car0', item: 'replyAll', by: 'car1', blocked: true },
      { type: 'honk', car: 'car0' },
      { type: 'wallHit', car: 'car9', speed: 9 }, // not in the race
    ], new Set(['car0']), 0.5);
    expect(counts.get('car0')).toMatchObject({ wallHits: 2, honks: 1, brakeSeconds: 0.5, itemHits: 0 });
    expect(counts.get('car1')).toMatchObject({ maxDriftLevel: 2, driftBoosts: 1, itemHits: 1, brakeSeconds: 0 });
  });
});

describe('picking awards', () => {
  it('the clear leader of a stat over its limit wins it; ties and small numbers win nothing', () => {
    expect(pickAwards([car(0, 1, { wallHits: 5 }), car(1, 2, { wallHits: 1 })], [rule({})], 3)).toEqual([
      { id: 'wallHugger', slot: 0 },
      { id: DUCK_AWARD, slot: 1 },
    ]);
    expect(pickAwards([car(0, 1, { wallHits: 5 }), car(1, 2, { wallHits: 5 })], [rule({})], 3).map((a) => a.id)).toEqual([DUCK_AWARD]);
    expect(pickAwards([car(0, 1, { wallHits: 2 }), car(1, 2, { wallHits: 0 })], [rule({})], 3).map((a) => a.id)).toEqual([DUCK_AWARD]);
  });

  it('"fewest" awards can require a finish; bots never win awards but can get the duck', () => {
    const clean = rule({ id: 'clean', stat: 'wallHits', pick: 'fewest', limit: 0, finishedOnly: true });
    const cars = [
      car(0, 1, { wallHits: 4 }),
      car(1, 3, { wallHits: 0 }, { finished: false, dnf: true }),
      car(2, 2, { wallHits: 0 }),
      car(3, 4, { wallHits: 0 }, { bot: true, players: [] }),
    ];
    expect(pickAwards(cars, [clean], 3)).toEqual([{ id: 'clean', slot: 2 }, { id: DUCK_AWARD, slot: 3 }]);
  });

  it('at most `maxAwards` (config order), then always the duck', () => {
    const rules = [rule({ id: 'a' }), rule({ id: 'b', stat: 'honks', limit: 1 }), rule({ id: 'c', stat: 'itemHits', limit: 1 })];
    const cars = [car(0, 1, { wallHits: 9, honks: 3, itemHits: 2 }), car(1, 2, {})];
    expect(pickAwards(cars, rules, 2).map((a) => a.id)).toEqual(['a', 'b', DUCK_AWARD]);
  });

  it('nobody is alone enough for an award or the duck', () => {
    expect(pickAwards([car(0, 1, { wallHits: 9 })], [rule({})], 3)).toEqual([]);
  });

  it('fills the line with the number', () => {
    expect(awardLine(rule({}), { ...NO_COUNTS, wallHits: 9 })).toBe('bounced off 9 walls');
    expect(awardLine(rule({ stat: 'brakeSeconds', line: '{n} s on the brake' }), { ...NO_COUNTS, brakeSeconds: 12.6 })).toBe('13 s on the brake');
  });
});
