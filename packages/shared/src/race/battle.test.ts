import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim/types';
import { applyBattleEvents, battleOver, battleResults, battleStandings, dropBattleCar, isOut, newBattle } from './battle';

const cfg = { lives: 3, hitGraceSeconds: 2, timeLimitSeconds: 150 };
const dt = 1 / 60;
const hit = (car: string, blocked = false): SimEvent => ({ type: 'itemHit', car, item: 'replyAll', by: 'car9', blocked });

describe('battle mode (P11.6)', () => {
  it('unblocked hits take a life, with a grace after each', () => {
    const b = newBattle(['car0', 'car1'], cfg, 0);
    applyBattleEvents(b, [hit('car0')], 10, cfg, dt);
    expect(b.lives.get('car0')).toBe(2);
    applyBattleEvents(b, [hit('car0')], 20, cfg, dt); // inside the 2 s grace
    expect(b.lives.get('car0')).toBe(2);
    applyBattleEvents(b, [hit('car0', true)], 500, cfg, dt); // a Firewall blocked it
    expect(b.lives.get('car0')).toBe(2);
    applyBattleEvents(b, [hit('car0')], 500, cfg, dt);
    expect(b.lives.get('car0')).toBe(1);
  });

  it('the last life puts the car out; last car standing ends it', () => {
    const b = newBattle(['car0', 'car1', 'car2'], cfg, 0);
    let t = 0;
    const knockOut = (id: string): string[] => {
      let out: string[] = [];
      for (let i = 0; i < cfg.lives; i++) out = applyBattleEvents(b, [hit(id)], (t += 200), cfg, dt);
      return out;
    };
    expect(knockOut('car1')).toEqual(['car1']);
    expect(isOut(b, 'car1')).toBe(true);
    expect(battleOver(b, t, cfg, dt)).toBe(false);
    knockOut('car0');
    expect(battleOver(b, t, cfg, dt)).toBe(true);
    // car2 standing, then car0 (out later) beat car1 (out first).
    expect(battleStandings(b)).toEqual(['car2', 'car0', 'car1']);
    const rows = battleResults(b, t);
    expect(rows.map((r) => [r.id, r.place, r.dnf])).toEqual([['car2', 1, false], ['car0', 2, true], ['car1', 3, true]]);
    expect(rows[0]!.timeTicks).toBe(t);
  });

  it('time up ends it, most lives first; a lone car only ends on time', () => {
    const b = newBattle(['car0', 'car1'], cfg, 100);
    applyBattleEvents(b, [hit('car1')], 200, cfg, dt);
    expect(battleOver(b, 100 + 150 * 60 - 1, cfg, dt)).toBe(false);
    expect(battleOver(b, 100 + 150 * 60, cfg, dt)).toBe(true);
    expect(battleStandings(b)).toEqual(['car0', 'car1']);
    const solo = newBattle(['car0'], cfg, 0);
    expect(battleOver(solo, 10, cfg, dt)).toBe(false);
  });

  it('a car that leaves stops counting', () => {
    const b = newBattle(['car0', 'car1'], cfg, 0);
    dropBattleCar(b, 'car1');
    expect(battleStandings(b)).toEqual(['car0']);
    dropBattleCar(b, 'car0');
    expect(battleOver(b, 1, cfg, dt)).toBe(true);
  });
});
