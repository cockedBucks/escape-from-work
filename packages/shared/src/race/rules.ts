import type { Tuning } from '../config/tuning';
import type { CarState, SimEvent, World } from '../sim/types';
import type { TrackSample } from '../track/build';
import { Rng } from '../util/rng';

// Race rules (GAME_DESIGN §6): laps by sectors in order, live positions, wrong way, finish
// order, finish window + DNF, grid order. Pure functions over plain data, driven by the
// server once per tick while the phase is "racing".

type RaceCfg = Tuning['race'];

/** One car's race so far. */
export interface CarRun {
  id: string;
  /** Sector gates passed in order since the start (laps = floor(this / sectors)). */
  sectorsDone: number;
  lapsDone: number;
  lapStartTick: number;
  /** Fastest lap (ticks), null until a lap is done. */
  bestLapTicks: number | null;
  /** Tick the car finished, null while racing. */
  finishTick: number | null;
  dnf: boolean;
  /** Ticks in a row spent driving against the track direction. */
  wrongWayTicks: number;
  /** Tick each sector was passed: sectorTicks[k] = when sectorsDone became k + 1 (for gaps). */
  sectorTicks: number[];
}

export interface RaceRun {
  laps: number;
  startTick: number;
  /** Tick the first car finished (opens the finish window), null before. */
  winnerTick: number | null;
  /** Car ids in the order they crossed the line. */
  finishOrder: string[];
  cars: Map<string, CarRun>;
}

/** A finished race, best first. */
export interface ResultRow {
  id: string;
  place: number;
  /** Race time (ticks from GO to the line), null for DNF. */
  timeTicks: number | null;
  bestLapTicks: number | null;
  lapsDone: number;
  dnf: boolean;
}

export function newRun(carIds: readonly string[], laps: number, startTick: number): RaceRun {
  const cars = new Map<string, CarRun>();
  for (const id of [...carIds].sort()) {
    cars.set(id, {
      id, sectorsDone: 0, lapsDone: 0, lapStartTick: startTick, bestLapTicks: null,
      finishTick: null, dnf: false, wrongWayTicks: 0, sectorTicks: [],
    });
  }
  return { laps, startTick, winnerTick: null, finishOrder: [], cars };
}

/**
 * Time gap to the leader (ticks): when this car passed its latest sector minus when the
 * leader passed that same sector. Finishers compare finish times. 0 for the leader or
 * before the first sector.
 */
export function gapTicks(run: RaceRun, leaderId: string, id: string): number {
  const me = run.cars.get(id);
  const leader = run.cars.get(leaderId);
  if (!me || !leader || id === leaderId) return 0;
  if (me.finishTick !== null && leader.finishTick !== null) return me.finishTick - leader.finishTick;
  const k = me.sectorsDone - 1;
  const mine = me.sectorTicks[k];
  const theirs = leader.sectorTicks[k];
  return mine === undefined || theirs === undefined ? 0 : Math.max(0, mine - theirs);
}

/** A car left mid-race (its last player went away): it simply stops counting. */
export function dropCar(run: RaceRun, id: string): void {
  run.cars.delete(id);
}

/**
 * Apply one tick's sim events: every in-order checkpoint is a sector; passing gate 0 after
 * all the others completes a lap; the last lap finishes the race for that car.
 */
export function applyEvents(run: RaceRun, events: readonly SimEvent[], tick: number): void {
  for (const e of events) {
    if (e.type !== 'checkpoint') continue;
    const car = run.cars.get(e.car);
    if (!car || car.finishTick !== null || car.dnf) continue;
    car.sectorsDone++;
    car.sectorTicks.push(tick);
    if (e.gate !== 0) continue;
    car.lapsDone++;
    const lap = tick - car.lapStartTick;
    car.bestLapTicks = car.bestLapTicks === null ? lap : Math.min(car.bestLapTicks, lap);
    car.lapStartTick = tick;
    if (car.lapsDone >= run.laps) {
      car.finishTick = tick;
      run.finishOrder.push(car.id);
      if (run.winnerTick === null) run.winnerTick = tick;
    }
  }
}

/**
 * How far along the race a car is, in sectors: sectors done plus how far it is into the
 * next one (negative while still behind the gate it last passed, e.g. on the grid).
 */
export function raceDistance(run: RaceRun, world: World, car: CarState): number {
  const r = run.cars.get(car.id);
  if (!r) return -Infinity;
  const sectors = world.track.gates.length;
  const gateProgress = world.track.gates[car.lastGate]?.progress ?? 0;
  const lapGate = (gateProgress - (world.track.gates[0]?.progress ?? 0) + 1) % 1;
  let into = car.progress - lapGate;
  if (into > 0.5) into -= 1;
  if (into <= -0.5) into += 1;
  const fraction = Math.max(-1, Math.min(1, into * sectors));
  return r.sectorsDone + fraction;
}

/** Car ids by current place: finishers in finishing order, then by race distance. */
export function standings(run: RaceRun, world: World): string[] {
  const finished = run.finishOrder.filter((id) => run.cars.has(id));
  const racing = world.cars
    .filter((c) => {
      const r = run.cars.get(c.id);
      return r !== undefined && r.finishTick === null;
    })
    // DNFs too: they are ordered by how far they got.
    .map((c) => ({ id: c.id, d: raceDistance(run, world, c) }))
    .sort((a, b) => b.d - a.d || (a.id < b.id ? -1 : 1));
  return [...finished, ...racing.map((x) => x.id)];
}

/**
 * Wrong-way check for one tick: moving against the track direction faster than
 * `race.wrongWayMinSpeed`; `isWrongWay` says when it has lasted long enough to warn.
 */
export function updateWrongWay(run: RaceRun, world: World, race: RaceCfg): void {
  for (const car of world.cars) {
    const r = run.cars.get(car.id);
    if (!r) continue;
    if (r.finishTick !== null || r.dnf) {
      r.wrongWayTicks = 0; // finished: free to drive any way
      continue;
    }
    const s = world.track.samples[car.segment] as TrackSample | undefined;
    const along = s ? car.vx * s.dir.x + car.vz * s.dir.z : 0;
    r.wrongWayTicks = along < -race.wrongWayMinSpeed ? r.wrongWayTicks + 1 : 0;
  }
}

export const isWrongWay = (r: CarRun, race: RaceCfg, dt: number): boolean =>
  r.wrongWayTicks >= Math.round(race.wrongWaySeconds / dt);

/**
 * Is the race over? Yes when every car finished, when the finish window after the winner
 * has closed, or when `race.maxRaceSeconds` ran out (everyone still out becomes DNF), or
 * when no cars are left.
 */
export function raceOver(run: RaceRun, tick: number, race: RaceCfg, dt: number): boolean {
  const cars = [...run.cars.values()];
  if (cars.length === 0) return true;
  if (cars.every((c) => c.finishTick !== null || c.dnf)) return true;
  const windowClosed = run.winnerTick !== null && tick - run.winnerTick >= Math.round(race.finishWindowSeconds / dt);
  // Safety: no finisher (everyone idle or stuck) must not keep the room racing forever.
  const timeUp = tick - run.startTick >= Math.round(race.maxRaceSeconds / dt);
  if (windowClosed || timeUp) {
    for (const c of cars) if (c.finishTick === null) c.dnf = true;
    return true;
  }
  return false;
}

/** Final results, best first: finishers by time, then DNFs by how far they got. */
export function results(run: RaceRun, world: World): ResultRow[] {
  return standings(run, world).map((id, i) => {
    const r = run.cars.get(id)!;
    return {
      id,
      place: i + 1,
      timeTicks: r.finishTick === null ? null : r.finishTick - run.startTick,
      bestLapTicks: r.bestLapTicks,
      lapsDone: r.lapsDone,
      dnf: r.finishTick === null,
    };
  });
}

/**
 * Starting order for the next race (car ids, pole first): random for the first race,
 * then the previous results reversed so the leaders start at the back. Cars that were not
 * in the last race go to the front in random order.
 */
export function gridOrder(carIds: readonly string[], previous: readonly ResultRow[] | null, rng: Rng): string[] {
  const ids = [...carIds].sort();
  const shuffle = (list: string[]): string[] => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [list[i], list[j]] = [list[j] as string, list[i] as string];
    }
    return list;
  };
  if (!previous || previous.length === 0) return shuffle(ids);
  const ranked = previous.map((r) => r.id).filter((id) => ids.includes(id)).reverse();
  const fresh = shuffle(ids.filter((id) => !ranked.includes(id)));
  return [...fresh, ...ranked];
}
