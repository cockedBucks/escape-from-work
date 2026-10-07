import type { Tuning } from '../config/tuning';
import type { SimEvent } from '../sim/types';
import type { ResultRow } from './rules';

// Battle mode (P11.6, GAME_DESIGN §13): every car starts with `battle.lives`; an item hit that
// a Firewall does not block takes one (then a short grace, so one Reply-All storm is not three
// lives); a car with none left is out. Last car standing wins, or the most lives when time
// runs out. Laps do not count. Pure functions over plain data, driven by the server.

export const RACE_MODES = ['race', 'battle'] as const;
export type RaceMode = (typeof RACE_MODES)[number];

type BattleCfg = Tuning['battle'];

export interface BattleRun {
  startTick: number;
  /** Lives left per car id. */
  lives: Map<string, number>;
  /** Tick each car last lost a life (grace). */
  lastHit: Map<string, number>;
  /** Tick each car went out. */
  outTick: Map<string, number>;
  /** How many cars started (a lone car only ends on time). */
  started: number;
}

export function newBattle(carIds: readonly string[], cfg: BattleCfg, startTick: number): BattleRun {
  const ids = [...carIds].sort();
  return { startTick, lives: new Map(ids.map((id) => [id, cfg.lives])), lastHit: new Map(), outTick: new Map(), started: ids.length };
}

export const isOut = (b: BattleRun, id: string): boolean => b.outTick.has(id);

/** Apply one tick's events: unblocked item hits take lives. Returns the cars that went out now. */
export function applyBattleEvents(b: BattleRun, events: readonly SimEvent[], tick: number, cfg: BattleCfg, dt: number): string[] {
  const out: string[] = [];
  const grace = Math.round(cfg.hitGraceSeconds / dt);
  for (const e of events) {
    if (e.type !== 'itemHit' || e.blocked) continue;
    const lives = b.lives.get(e.car);
    if (lives === undefined || lives <= 0) continue;
    const last = b.lastHit.get(e.car);
    if (last !== undefined && tick - last < grace) continue;
    b.lastHit.set(e.car, tick);
    b.lives.set(e.car, lives - 1);
    if (lives - 1 === 0) {
      b.outTick.set(e.car, tick);
      out.push(e.car);
    }
  }
  return out;
}

/** A car left mid-battle: it no longer counts. */
export function dropBattleCar(b: BattleRun, id: string): void {
  b.lives.delete(id);
  b.lastHit.delete(id);
  b.outTick.delete(id);
}

/** Over when at most one car is left standing (of two or more), on time, or with no cars. */
export function battleOver(b: BattleRun, tick: number, cfg: BattleCfg, dt: number): boolean {
  if (b.lives.size === 0) return true;
  const standing = [...b.lives.keys()].filter((id) => !b.outTick.has(id)).length;
  if (b.started >= 2 && standing <= 1) return true;
  return tick - b.startTick >= Math.round(cfg.timeLimitSeconds / dt);
}

/** Car ids best first: most lives; among those out, the one that lasted longer; then by id. */
export function battleStandings(b: BattleRun): string[] {
  return [...b.lives.keys()].sort((x, y) => {
    const lives = (b.lives.get(y) ?? 0) - (b.lives.get(x) ?? 0);
    if (lives !== 0) return lives;
    const ox = b.outTick.get(x) ?? Number.POSITIVE_INFINITY;
    const oy = b.outTick.get(y) ?? Number.POSITIVE_INFINITY;
    if (ox !== oy) return oy - ox;
    return x < y ? -1 : 1;
  });
}

/** Final results, best first. `timeTicks` = how long the car lasted (the whole battle if never out); out cars are `dnf`. */
export function battleResults(b: BattleRun, endTick: number): ResultRow[] {
  return battleStandings(b).map((id, i) => {
    const out = b.outTick.get(id);
    return { id, place: i + 1, timeTicks: (out ?? endTick) - b.startTick, bestLapTicks: null, lapsDone: 0, dnf: out !== undefined };
  });
}
