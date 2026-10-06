import type { Tuning } from '../config/tuning';
import type { Track, TrackSample } from '../track/build';
import { angleDiff, clamp, length, sub, yawOf } from '../util/math';
import type { CarState } from '../sim/types';
import { cornerAhead } from './engineer';

/** The point on the centerline the bot aims at: further ahead the faster it goes. */
export function lookAheadPoint(car: CarState, track: Track, bot: Tuning['bot']): TrackSample {
  const n = track.samples.length;
  const speed = length({ x: car.vx, z: car.vz });
  const ahead = bot.lookAheadBase + speed * bot.lookAheadTime;
  const steps = Math.max(1, Math.ceil(ahead / track.spacing));
  return track.samples[(car.segment + steps) % n] as TrackSample;
}

/**
 * Pilot half of the bot: steer toward the look-ahead point. Returns -1..1 (+1 = right).
 * A target to the left means a bigger yaw, which needs negative (left) steer.
 * With `skill` ≥ 1 it also drifts with its Engineer: it turns in hard before a tight corner
 * (so a brake tap starts a drift) and, while drifting, never lets the wheel near straight
 * until the corner is over (that would end the drift early); then it straightens = boost.
 */
export function botSteer(car: CarState, track: Track, cfg: Tuning, skill = 0): number {
  const { bot, drift } = cfg;
  const target = lookAheadPoint(car, track, bot);
  const toTarget = sub(target.pos, { x: car.x, z: car.z });
  const angle = angleDiff(car.yaw, yawOf(toTarget));
  const steer = clamp(-angle * bot.steerGain, -1, 1);
  if (skill < 1) return steer;

  const corner = cornerAhead(car, track, bot.driftLookAhead);
  const tight = Math.abs(corner) >= bot.driftMinCurvature;
  const fast = length({ x: car.vx, z: car.vz }) >= drift.minSpeedRatio * cfg.car.topSpeed * car.stats.speed;
  // Curvature + turns left; left is negative steer.
  const into = -Math.sign(corner);
  if (car.driftDir === 0) return tight && fast && Math.sign(steer) === into ? into * Math.max(Math.abs(steer), drift.minSteer + bot.driftSteerMargin) : steer;
  // Corner over (or it turns the other way now): straighten out; the Engineer is on the gas = boost.
  const here = cornerAhead(car, track, bot.driftHoldAhead);
  const turning = Math.abs(here) >= bot.driftMinCurvature && -Math.sign(here) === car.driftDir;
  if (!turning) return steer;
  const rel = steer * car.driftDir;
  const hold = drift.releaseSteer + bot.driftSteerMargin;
  return Math.abs(rel) >= hold ? steer : car.driftDir * (rel >= 0 ? hold : -hold);
}
