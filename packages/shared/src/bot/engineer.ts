import type { Tuning } from '../config/tuning';
import type { Track, TrackSample } from '../track/build';
import { dot, forward } from '../util/math';
import type { CarState } from '../sim/types';

/** Mutable per-bot memory: skill level, how long it has been stuck, last tick's brake. */
export interface BotMemory {
  /** 0 = plain driving, 1 = also drifts, 2 = drifts + nitro (`bot.skill` for server bots). */
  skill: number;
  stuckTicks: number;
  braked: boolean;
}

export const newBotMemory = (skill = 0): BotMemory => ({ skill, stuckTicks: 0, braked: false });

/** The tightest curvature (1/m, signed: + turns left) within `distance` meters ahead. */
export function cornerAhead(car: CarState, track: Track, distance: number): number {
  const n = track.samples.length;
  let tightest = 0;
  for (let k = 0; k <= Math.ceil(distance / track.spacing); k++) {
    const c = (track.samples[(car.segment + k) % n] as TrackSample).curvature;
    if (Math.abs(c) > Math.abs(tightest)) tightest = c;
  }
  return tightest;
}

/**
 * The fastest speed the bot is willing to carry right now: for every curve in the next
 * `planDistance` meters, the corner speed sqrt(cornerAccel × radius), plus what braking can
 * shed before reaching it. Never above `topShare` × the car's top speed.
 */
export function plannedSpeed(car: CarState, track: Track, cfg: Tuning, topShare = 1): number {
  const { bot } = cfg;
  const n = track.samples.length;
  const steps = Math.ceil(bot.planDistance / track.spacing);
  let allowed = cfg.car.topSpeed * car.stats.speed * topShare;
  for (let k = 0; k <= steps; k++) {
    const s = track.samples[(car.segment + k) % n] as TrackSample;
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
): { gas: boolean; brake: boolean; respawn: boolean; nitro: boolean } {
  const vF = dot({ x: car.vx, z: car.vz }, forward(car.yaw));

  // A stalled engine is not stuck: it restarts by itself.
  if (car.respawnAtTick < 0 && car.stallUntilTick < 0 && Math.abs(vF) < cfg.bot.stuckSpeed) memory.stuckTicks++;
  else memory.stuckTicks = 0;
  const respawn = memory.stuckTicks >= Math.round(cfg.bot.stuckSeconds / cfg.sim.dt);
  if (respawn) memory.stuckTicks = 0;

  const { bot, drift } = cfg;
  const top = cfg.car.topSpeed * car.stats.speed;
  // Let go of the gas just before the engine would stall (cools, then back on).
  const cool = car.heat < bot.heatLiftAt;

  // Drifting: stay on the gas (no braking: that would end it), so letting go boosts.
  if (memory.skill >= 1 && car.driftDir !== 0) {
    memory.braked = false;
    return { gas: car.heat < bot.driftHeatLiftAt, brake: false, respawn, nitro: false };
  }
  // Start one: a single-tick brake tap while the Pilot steers hard into a tight corner.
  const tap =
    memory.skill >= 1 && !memory.braked && Math.abs(car.steer) >= drift.minSteer && vF >= drift.minSpeedRatio * top &&
    Math.abs(cornerAhead(car, track, bot.driftLookAhead)) >= bot.driftMinCurvature;
  if (tap) {
    memory.braked = true;
    return { gas: cool, brake: true, respawn, nitro: false };
  }

  const target = plannedSpeed(car, track, cfg);
  const brake = vF > 0 && vF > target + bot.speedMargin;
  memory.braked = brake;
  // Nitro on a straight clear enough for nitro speed (no hard braking after it, which would
  // spoil the next drift tap) while the engine is cool.
  const nitroTop = top * cfg.nitro.topSpeed;
  const nitro =
    memory.skill >= 2 && car.nitro > 0 && !brake && car.heat < bot.nitroMaxHeat && plannedSpeed(car, track, cfg, cfg.nitro.topSpeed) >= nitroTop;
  return { gas: !brake && vF < target && cool, brake, respawn, nitro };
}
