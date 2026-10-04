import type { Tuning } from '../config/tuning';
import type { Track, TrackSample } from '../track/build';
import { dot, forward } from '../util/math';
import type { CarState } from '../sim/types';

/** Mutable per-bot memory (the engineer counts how long it has been stuck). */
export interface BotMemory {
  stuckTicks: number;
}

export const newBotMemory = (): BotMemory => ({ stuckTicks: 0 });

/**
 * The fastest speed the bot is willing to carry right now: for every curve in the next
 * `planDistance` meters, the corner speed sqrt(cornerAccel × radius), plus what braking can
 * shed before reaching it.
 */
export function plannedSpeed(car: CarState, track: Track, cfg: Tuning): number {
  const { bot } = cfg;
  const n = track.samples.length;
  const steps = Math.ceil(bot.planDistance / track.spacing);
  let allowed = cfg.car.topSpeed * car.stats.speed;
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

/** Engineer half of the bot: gas, brake, and respawn when stuck. */
export function botPedals(
  car: CarState,
  track: Track,
  cfg: Tuning,
  memory: BotMemory,
): { gas: boolean; brake: boolean; respawn: boolean } {
  const vF = dot({ x: car.vx, z: car.vz }, forward(car.yaw));

  if (car.respawnAtTick < 0 && Math.abs(vF) < cfg.bot.stuckSpeed) memory.stuckTicks++;
  else memory.stuckTicks = 0;
  const respawn = memory.stuckTicks >= Math.round(cfg.bot.stuckSeconds / cfg.sim.dt);
  if (respawn) memory.stuckTicks = 0;

  const target = plannedSpeed(car, track, cfg);
  const brake = vF > 0 && vF > target + cfg.bot.speedMargin;
  return { gas: !brake && vF < target, brake, respawn };
}
