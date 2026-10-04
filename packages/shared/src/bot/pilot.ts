import type { Tuning } from '../config/tuning';
import type { Track, TrackSample } from '../track/build';
import { angleDiff, clamp, length, sub, yawOf } from '../util/math';
import type { CarState } from '../sim/types';

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
 */
export function botSteer(car: CarState, track: Track, bot: Tuning['bot']): number {
  const target = lookAheadPoint(car, track, bot);
  const toTarget = sub(target.pos, { x: car.x, z: car.z });
  const angle = angleDiff(car.yaw, yawOf(toTarget));
  return clamp(-angle * bot.steerGain, -1, 1);
}
