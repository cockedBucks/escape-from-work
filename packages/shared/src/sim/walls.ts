import type { CarTuning } from '../config/tuning';
import { wallsNear, type Track } from '../track/build';
import { closestOnSegment, dot, EPSILON, scale, sub, add, type Vec2 } from '../util/math';
import type { CarState } from './types';

/**
 * Push the car (a circle) out of every wall it overlaps and bounce it off.
 * Returns the hardest impact speed into a wall this tick (0 = no real hit). Only a real
 * hit (at least `wallHitMinSpeed`) costs along-wall speed, so scraping a wall is cheap.
 */
export function collideWalls(state: CarState, track: Track, car: CarTuning): number {
  let pos: Vec2 = { x: state.x, z: state.z };
  let vel: Vec2 = { x: state.vx, z: state.vz };
  let hardest = 0;

  for (const wall of wallsNear(track, pos, car.radius)) {
    const { point, t } = closestOnSegment(pos, wall.a, wall.b);
    const delta = sub(pos, point);
    const side = dot(delta, wall.normal);
    const d = Math.sqrt(dot(delta, delta));
    // In front of the wall, or past one of its ends: push along the line to the closest
    // point (this rounds wall corners). Only when the center crossed the middle of the
    // segment do we push straight back along the wall normal.
    const pastEnd = t <= 0 || t >= 1;
    const inFront = d > EPSILON && (side >= 0 || pastEnd);
    const n = inFront ? scale(delta, 1 / d) : wall.normal;
    const penetration = inFront ? car.radius - d : car.radius + d;
    if (penetration <= 0) continue;

    pos = add(pos, scale(n, penetration));
    const vn = dot(vel, n);
    if (vn >= 0) continue; // already moving away
    const normalPart = scale(n, vn);
    let along = sub(vel, normalPart);
    const impact = -vn;
    if (impact >= car.wallHitMinSpeed) along = scale(along, 1 - car.wallSpeedLoss);
    vel = add(along, scale(n, impact * car.wallBounce));
    hardest = Math.max(hardest, impact);
  }

  state.x = pos.x;
  state.z = pos.z;
  state.vx = vel.x;
  state.vz = vel.z;
  return hardest >= car.wallHitMinSpeed ? hardest : 0;
}
