import type { Tuning } from '../config/tuning';

// The race loop (GAME_DESIGN §6): lobby → countdown → racing → results → lobby (or rematch:
// results → countdown). The server drives it; these are the rules, pure and testable.

export const RACE_PHASES = ['lobby', 'countdown', 'racing', 'results'] as const;
export type RacePhase = (typeof RACE_PHASES)[number];

export interface RaceFlow {
  phase: RacePhase;
  /** Sim tick when the current phase began. */
  phaseTick: number;
  /** Player id of the host (starts races, changes settings), or null when nobody is here. */
  host: string | null;
  /** Laps for the next race. */
  laps: number;
}

type RaceCfg = Tuning['race'];

export function newFlow(race: RaceCfg): RaceFlow {
  return { phase: 'lobby', phaseTick: 0, host: null, laps: race.defaultLaps };
}

/** Seats may change only between races (otherwise leave + retake = teleport to the grid). */
export const seatChangesAllowed = (phase: RacePhase): boolean => phase === 'lobby' || phase === 'results';

/** Cars ignore their controls during the countdown (everyone waits on the grid). */
export const inputsAllowed = (phase: RacePhase): boolean => phase !== 'countdown';

/** Countdown length in ticks. */
export const countdownTicks = (race: RaceCfg, dt: number): number => Math.round(race.countdownSeconds / dt);

/** Seconds of countdown left (0 outside the countdown), for "3… 2… 1…". */
export function countdownLeft(flow: RaceFlow, tick: number, race: RaceCfg, dt: number): number {
  if (flow.phase !== 'countdown') return 0;
  return Math.max(0, (countdownTicks(race, dt) - (tick - flow.phaseTick)) * dt);
}

/** Why the host may not start a race now, or null if they may. */
export function startProblem(flow: RaceFlow, by: string, cars: number): string | null {
  if (by !== flow.host) return 'only the host can start the race';
  if (flow.phase !== 'lobby' && flow.phase !== 'results') return 'a race is already on';
  if (cars < 1) return 'there are no cars (sit in one, or turn bots on)';
  return null;
}

/** Why the host may not change the lap count now, or null if they may. */
export function lapsProblem(flow: RaceFlow, by: string, laps: number, race: RaceCfg): string | null {
  if (by !== flow.host) return 'only the host can change the laps';
  if (!seatChangesAllowed(flow.phase)) return 'not during a race';
  if (!Number.isInteger(laps) || laps < race.minLaps || laps > race.maxLaps) {
    return `laps must be ${race.minLaps}–${race.maxLaps}`;
  }
  return null;
}

function enter(flow: RaceFlow, phase: RacePhase, tick: number): void {
  flow.phase = phase;
  flow.phaseTick = tick;
}

/** Host pressed Start (or Rematch): begin the countdown. Check `startProblem` first. */
export const startCountdown = (flow: RaceFlow, tick: number): void => enter(flow, 'countdown', tick);

/** Back to the lobby (host's choice after the results, or everyone left). */
export const toLobby = (flow: RaceFlow, tick: number): void => enter(flow, 'lobby', tick);

/**
 * Advance on time and race state, once per tick. `raceOver` comes from the race rules
 * (everyone finished or the finish window closed). Returns the new phase when it changed.
 */
export function stepFlow(flow: RaceFlow, tick: number, race: RaceCfg, dt: number, raceOver: boolean): RacePhase | null {
  if (flow.phase === 'countdown' && tick - flow.phaseTick >= countdownTicks(race, dt)) {
    enter(flow, 'racing', tick);
    return 'racing';
  }
  if (flow.phase === 'racing' && raceOver) {
    enter(flow, 'results', tick);
    return 'results';
  }
  return null;
}

/**
 * The host: keep the current one while they are still here and connected, else the
 * earliest-joined connected player. `joinOrder` lists player ids, earliest first.
 */
export function chooseHost(joinOrder: readonly string[], isConnected: (id: string) => boolean, current: string | null): string | null {
  if (current !== null && joinOrder.includes(current) && isConnected(current)) return current;
  return joinOrder.find(isConnected) ?? null;
}
