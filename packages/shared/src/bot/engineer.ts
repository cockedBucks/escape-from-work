import type { Tuning } from '../config/tuning';
import type { Track } from '../track/build';
import { aimAngle, routeSample, shortcutAhead } from './route';
import { dot, forward } from '../util/math';
import type { CarState } from '../sim/types';

/** Mutable per-bot memory: skill level, how long it has been stuck, last tick's brake, backing up. */
export interface BotMemory {
  /** 0 = plain driving, 1 = also drifts, 2 = drifts + nitro (`bot.skill` for server bots). */
  skill: number;
  stuckTicks: number;
  braked: boolean;
  /** Ticks of reversing left (backing out of a wall). */
  backUpTicks: number;
  /** Back-ups since the bot last made real progress (after `bot.maxBackUps` it respawns instead). */
  backUps: number;
  /** Main-loop segment where the last back-up started (progress past it resets `backUps`). */
  backUpSegment: number;
  /** Ticks of turning around left (reversing with the wheel turned, a three-point turn). */
  turnTicks: number;
}

export const newBotMemory = (skill = 0): BotMemory => ({
  skill, stuckTicks: 0, braked: false, backUpTicks: 0, backUps: 0, backUpSegment: 0, turnTicks: 0,
});

/** Forget being stuck (e.g. while the race is not running and controls are ignored). */
export function resetStuck(memory: BotMemory): void {
  memory.stuckTicks = 0;
  memory.backUpTicks = 0;
  memory.backUps = 0;
  memory.turnTicks = 0;
}

const REVERSE = { gas: false, brake: true, nitro: false } as const;

/** The tightest curvature (1/m, signed: + turns left) within `distance` meters ahead. */
export function cornerAhead(car: CarState, track: Track, distance: number, route: readonly number[] = []): number {
  let tightest = 0;
  for (let k = 0; k <= Math.ceil(distance / track.spacing); k++) {
    const c = routeSample(track, car.segment + k, route).curvature;
    if (Math.abs(c) > Math.abs(tightest)) tightest = c;
  }
  return tightest;
}

/** Is there a tight corner turning the other way than `corner` within `distance` m ahead (an S-bend)? */
export function cornerReverses(car: CarState, track: Track, distance: number, corner: number, minCurvature: number, route: readonly number[] = []): boolean {
  for (let k = 0; k <= Math.ceil(distance / track.spacing); k++) {
    const c = routeSample(track, car.segment + k, route).curvature;
    if (Math.abs(c) >= minCurvature && Math.sign(c) === -Math.sign(corner)) return true;
  }
  return false;
}

/**
 * The fastest speed the bot is willing to carry right now: for every curve in the next
 * `planDistance` meters, the corner speed sqrt(cornerAccel × radius), plus what braking can
 * shed before reaching it. Never above `topShare` × the car's top speed.
 */
export function plannedSpeed(car: CarState, track: Track, cfg: Tuning, topShare = 1, route: readonly number[] = []): number {
  const { bot } = cfg;
  const steps = Math.ceil(bot.planDistance / track.spacing);
  let allowed = cfg.car.topSpeed * car.stats.speed * topShare;
  for (let k = 0; k <= steps; k++) {
    const s = routeSample(track, car.segment + k, route);
    const curv = Math.abs(s.curvature);
    if (curv === 0) continue;
    const corner = Math.sqrt(bot.cornerAccel / curv);
    const d = k * track.spacing;
    allowed = Math.min(allowed, Math.sqrt(corner * corner + 2 * bot.brakePlanDecel * d));
  }
  return allowed;
}

/**
 * Engineer half of the bot: gas, brake, engine heat, respawn when stuck, and with skill:
 * drift taps in tight corners (gas held through the drift, so the release boosts) and nitro
 * on clear straights while the engine is cool.
 */
export function botPedals(
  car: CarState,
  track: Track,
  cfg: Tuning,
  memory: BotMemory,
  route: readonly number[] = [],
): { gas: boolean; brake: boolean; respawn: boolean; nitro: boolean } {
  const vF = dot({ x: car.vx, z: car.vz }, forward(car.yaw));

  const { bot, drift } = cfg;
  const ticks = (seconds: number): number => Math.round(seconds / cfg.sim.dt);
  // Backing out of a wall (after a spin-out, nose first): reverse for a moment.
  if (memory.backUpTicks > 0) {
    memory.backUpTicks--;
    memory.braked = true;
    return { ...REVERSE, respawn: false };
  }
  // Real progress along the track (not just speed: circling into walls is fast too) means
  // the bot is unstuck: back-ups are allowed again.
  const n = track.samples.length;
  const ahead = (car.segment - memory.backUpSegment + n) % n;
  if (ahead * track.spacing >= bot.backUpResetDistance && ahead < n / 2) memory.backUps = 0;

  // A stalled engine is not stuck: it restarts by itself.
  if (car.respawnAtTick < 0 && car.stallUntilTick < 0 && Math.abs(vF) < bot.stuckSpeed) memory.stuckTicks++;
  else memory.stuckTicks = 0;
  if (memory.stuckTicks >= ticks(bot.backUpAfter) && memory.backUps < bot.maxBackUps) {
    memory.stuckTicks = 0;
    memory.turnTicks = 0;
    if (memory.backUps === 0) memory.backUpSegment = car.segment;
    memory.backUps++;
    memory.backUpTicks = ticks(bot.backUpSeconds) - 1;
    memory.braked = true;
    return { ...REVERSE, respawn: false };
  }
  // Still stuck after backing up: respawn.
  const respawn = memory.stuckTicks >= ticks(bot.stuckSeconds);
  if (respawn) memory.stuckTicks = 0;

  // Facing the wrong way (spun round, or bumped across the road) and slow: a U-turn at full
  // lock does not fit the road, so reverse with the wheel turned (the Pilot steers the other
  // way while rolling back) until the road ahead is roughly in front again.
  const off = Math.abs(aimAngle(car, track, bot, route));
  if (memory.turnTicks > 0) {
    memory.turnTicks = off <= bot.turnAroundDone ? 0 : memory.turnTicks - 1;
  } else if (off >= bot.turnAroundAngle && Math.abs(vF) < bot.turnAroundSpeed) {
    memory.turnTicks = ticks(bot.turnAroundSeconds);
  }
  if (memory.turnTicks > 0) {
    memory.braked = true;
    return { ...REVERSE, respawn };
  }

  const top = cfg.car.topSpeed * car.stats.speed;
  // Let go of the gas just before the engine would stall (cools, then back on).
  const cool = car.heat < bot.heatLiftAt;

  // Drifting: stay on the gas (no braking: that would end it), so letting go boosts.
  if (memory.skill >= 1 && car.driftDir !== 0) {
    memory.braked = false;
    return { gas: car.heat < bot.driftHeatLiftAt, brake: false, respawn, nitro: false };
  }
  // Start one: a single-tick brake tap while the Pilot steers hard into a tight corner, but
  // not into an S-bend (the drift would carry it into the wall of the next, opposite bend)
  // nor into a narrow shortcut.
  const corner = cornerAhead(car, track, bot.driftLookAhead, route);
  const tap =
    memory.skill >= 1 && !memory.braked && Math.abs(car.steer) >= drift.minSteer && vF >= drift.minSpeedRatio * top &&
    Math.abs(corner) >= bot.driftMinCurvature &&
    !cornerReverses(car, track, bot.driftClearAhead, corner, bot.driftMinCurvature, route) &&
    !shortcutAhead(track, car.segment, bot.driftClearAhead, route);
  if (tap) {
    memory.braked = true;
    return { gas: cool, brake: true, respawn, nitro: false };
  }

  const target = plannedSpeed(car, track, cfg, 1, route);
  const brake = vF > 0 && vF > target + bot.speedMargin;
  memory.braked = brake;
  // Nitro on a straight clear enough for nitro speed (no hard braking after it, which would
  // spoil the next drift tap) while the engine is cool.
  const nitroTop = top * cfg.nitro.topSpeed;
  const nitro =
    memory.skill >= 2 && car.nitro > 0 && !brake && car.heat < bot.nitroMaxHeat && plannedSpeed(car, track, cfg, cfg.nitro.topSpeed, route) >= nitroTop;
  return { gas: !brake && vF < target && cool, brake, respawn, nitro };
}
