import type { Tuning } from '../config/tuning';
import { angleDiff, length, sub, yawOf } from '../util/math';
import type { Track, TrackBranch, TrackSample } from '../track/build';
import { locateOnTrack } from '../track/locate';
import type { CarState } from '../sim/types';

/**
 * The shortcuts (branch indices) a bot follows right now. Bots with `bot.shortcutSkill` take
 * every shortcut; but a bot already past a shortcut's entrance on the main road (it missed
 * it, or respawned there) stays on the main road for that one.
 */
export function botRoute(car: CarState, track: Track, cfg: Tuning, skill: number): number[] {
  if (track.branches.length === 0 || skill < cfg.bot.shortcutSkill) return [];
  const p = (track.samples[car.segment] as TrackSample).progress;
  let road: number | undefined;
  const route: number[] = [];
  track.branches.forEach((b, i) => {
    if (p > b.def.from && p < b.def.to) {
      road ??= locateOnTrack(track, { x: car.x, z: car.z }, car.segment).road;
      if (road !== i + 1) return;
    }
    route.push(i);
  });
  return route;
}

/** The routed shortcut whose range holds main-loop sample `i` (wrapping), or -1. */
export function routedBranchAt(track: Track, i: number, route: readonly number[]): number {
  const n = track.samples.length;
  const p = (track.samples[((i % n) + n) % n] as TrackSample).progress;
  for (const r of route) {
    const b = track.branches[r] as TrackBranch;
    if (p > b.def.from && p < b.def.to) return r;
  }
  return -1;
}

/** Main-loop sample `i` (wrapping), or the point at the same progress on a routed shortcut. */
export function routeSample(track: Track, i: number, route: readonly number[]): TrackSample {
  const n = track.samples.length;
  const s = track.samples[((i % n) + n) % n] as TrackSample;
  const r = routedBranchAt(track, i, route);
  if (r < 0) return s;
  const b = track.branches[r] as TrackBranch;
  const m = b.samples.length;
  return b.samples[Math.round(((s.progress - b.def.from) / (b.def.to - b.def.from)) * (m - 1))] as TrackSample;
}

/** Does the route enter (or stay on) a shortcut within `distance` m ahead? Too narrow to drift. */
export function shortcutAhead(track: Track, segment: number, distance: number, route: readonly number[]): boolean {
  if (route.length === 0) return false;
  for (let k = 0; k <= Math.ceil(distance / track.spacing); k++) {
    if (routedBranchAt(track, segment + k, route) >= 0) return true;
  }
  return false;
}

/**
 * The point on the centerline the bot aims at: further ahead the faster it goes. On a
 * routed shortcut (`route`, see botRoute) it aims along the shortcut instead.
 */
export function lookAheadPoint(car: CarState, track: Track, bot: Tuning['bot'], route: readonly number[] = []): TrackSample {
  const speed = length({ x: car.vx, z: car.vz });
  const ahead = bot.lookAheadBase + speed * bot.lookAheadTime;
  const steps = Math.max(1, Math.ceil(ahead / track.spacing));
  if (routedBranchAt(track, car.segment + steps, route) < 0) return routeSample(track, car.segment + steps, route);
  // Aiming into a narrow shortcut: look closer, or the bot cuts the corner into its wedge.
  const near = Math.max(1, Math.ceil((ahead * bot.shortcutLookAhead) / track.spacing));
  return routeSample(track, car.segment + near, route);
}

/** Signed angle (rad) from the car's heading to its look-ahead point (+ = target to the left). */
export function aimAngle(car: CarState, track: Track, bot: Tuning['bot'], route: readonly number[] = []): number {
  const target = lookAheadPoint(car, track, bot, route);
  return angleDiff(car.yaw, yawOf(sub(target.pos, { x: car.x, z: car.z })));
}
