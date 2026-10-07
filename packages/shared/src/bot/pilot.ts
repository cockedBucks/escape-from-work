import type { Tuning } from '../config/tuning';
import type { Track } from '../track/build';
import { clamp, dot, forward, length } from '../util/math';
import type { CarState } from '../sim/types';
import { cornerAhead } from './engineer';
import { aimAngle, shortcutAhead } from './route';

/**
 * Pilot half of the bot: steer toward the look-ahead point. Returns -1..1 (+1 = right).
 * A target to the left means a bigger yaw, which needs negative (left) steer.
 * With `skill` ≥ 1 it also drifts with its Engineer: it turns in hard before a tight corner
 * (so a brake tap starts a drift) and, while drifting, never lets the wheel near straight
 * until the corner is over (that would end the drift early); then it straightens the wheel
 * (inside `drift.releaseSteer`) until the drift ends = boost.
 */
export function botSteer(car: CarState, track: Track, cfg: Tuning, skill = 0, route: readonly number[] = []): number {
  const { bot, drift } = cfg;
  const angle = aimAngle(car, track, bot, route);
  const steer = clamp(-angle * bot.steerGain, -1, 1);
  // Reversing (backing out of a wall): the wheel works the other way round.
  if (dot({ x: car.vx, z: car.vz }, forward(car.yaw)) < -bot.stuckSpeed) return -steer;
  if (skill < 1) return steer;

  const corner = cornerAhead(car, track, bot.driftLookAhead, route);
  const tight = Math.abs(corner) >= bot.driftMinCurvature && !shortcutAhead(track, car.segment, bot.driftClearAhead, route);
  const fast = length({ x: car.vx, z: car.vz }) >= drift.minSpeedRatio * cfg.car.topSpeed * car.stats.speed;
  // Curvature + turns left; left is negative steer.
  const into = -Math.sign(corner);
  if (car.driftDir === 0) return tight && fast && Math.sign(steer) === into ? into * Math.max(Math.abs(steer), drift.minSteer + bot.driftSteerMargin) : steer;
  // Corner over (or it turns the other way now): straighten out; the Engineer is on the gas = boost.
  const here = cornerAhead(car, track, bot.driftHoldAhead, route);
  const turning = Math.abs(here) >= bot.driftMinCurvature && -Math.sign(here) === car.driftDir;
  // Straighten the wheel to release (the aim alone can stay at full lock while the car points
  // sideways, which would keep the drift going into the next wall).
  const release = drift.releaseSteer - bot.driftSteerMargin;
  if (!turning) return clamp(steer, -release, release);
  const rel = steer * car.driftDir;
  const hold = drift.releaseSteer + bot.driftSteerMargin;
  return Math.abs(rel) >= hold ? steer : car.driftDir * (rel >= 0 ? hold : -hold);
}

export { lookAheadPoint } from './route';
