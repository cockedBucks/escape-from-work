import type { CarTuning } from '../config/tuning';
import { dot, forward } from '../util/math';
import type { CarState } from './types';

export const isAirborne = (state: CarState): boolean => state.y > 0 || state.vy > 0;

/**
 * Launch off a ramp: upward speed = `rampLaunch × zone launch × (forward speed / base top
 * speed)`, so a slow car only hops. Returns true when the car actually left the ground.
 */
export function launch(state: CarState, zoneLaunch: number, car: CarTuning): boolean {
  const vF = dot({ x: state.vx, z: state.vz }, forward(state.yaw));
  if (vF <= 0) return false;
  state.vy = car.rampLaunch * zoneLaunch * Math.min(vF / car.topSpeed, 1);
  return state.vy > 0;
}

/**
 * Gravity for one tick. Returns the landing impact speed when the car touched down this
 * tick and it was hard enough to count (`landingMinSpeed`), otherwise 0.
 */
export function fall(state: CarState, car: CarTuning, dt: number): number {
  if (!isAirborne(state)) return 0;
  state.vy -= car.gravity * dt;
  state.y += state.vy * dt;
  if (state.y > 0) return 0;
  const impact = -state.vy;
  state.y = 0;
  state.vy = 0;
  return impact >= car.landingMinSpeed ? impact : 0;
}
