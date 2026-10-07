import type { Tuning } from '../config/tuning';
import type { Track } from '../track/build';
import { clamp, dot, forward, length } from '../util/math';
import { isAirborne } from '../sim/air';
import type { CarState } from '../sim/types';
import { cornerAhead, cornerReverses } from './engineer';
import { aimAngle, shortcutAhead } from './route';

/**
 * Pilot half of the bot: steer toward the look-ahead point. Returns -1..1 (+1 = right).
 * A target to the left means a bigger yaw, which needs negative (left) steer. While drifting
 * the same aim works: steering into the drift tightens it, steering out widens it.
 */
export function botSteer(car: CarState, track: Track, cfg: Tuning, route: readonly number[] = []): number {
  const { bot } = cfg;
  const steer = clamp(-aimAngle(car, track, bot, route) * bot.steerGain, -1, 1);
  // Reversing (backing out of a wall): the wheel works the other way round.
  if (dot({ x: car.vx, z: car.vz }, forward(car.yaw)) < -bot.stuckSpeed) return -steer;
  return steer;
}

/**
 * The bot Pilot's drift key (P13.2), skill ≥ 1: held from just before a tight corner (not an
 * S-bend, which would carry the drift into the next wall, nor a narrow shortcut) while already
 * steering into it or not yet steering, so the drift goes the right way; kept down while the
 * road still bends that way; let go when the corner is over = boost. In the air it presses once
 * high enough for a trick.
 */
export function botDrift(car: CarState, track: Track, cfg: Tuning, steer: number, skill: number, route: readonly number[] = []): boolean {
  if (skill < 1) return false;
  // In the air: a fresh press once high enough = a trick (P13.5); let go before that.
  if (isAirborne(car)) return car.trick === 0 && car.y >= cfg.trick.minHeight;
  const { bot, drift } = cfg;
  if (car.driftDir !== 0) {
    const here = cornerAhead(car, track, bot.driftHoldAhead, route);
    return Math.abs(here) >= bot.driftHoldCurvature && -Math.sign(here) === car.driftDir;
  }
  const fast = length({ x: car.vx, z: car.vz }) >= drift.minSpeedRatio * cfg.car.topSpeed * car.stats.speed;
  const corner = cornerAhead(car, track, bot.driftLookAhead, route);
  // Curvature + turns left; left is negative steer.
  const into = -Math.sign(corner);
  return (
    fast &&
    Math.abs(corner) >= bot.driftMinCurvature &&
    (Math.abs(steer) <= drift.steerPick || Math.sign(steer) === into) &&
    !cornerReverses(car, track, bot.driftClearAhead, corner, bot.driftMinCurvature, route) &&
    !shortcutAhead(track, car.segment, bot.driftClearAhead, route)
  );
}

export { lookAheadPoint } from './route';
