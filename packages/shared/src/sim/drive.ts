import type { CarTuning } from '../config/tuning';
import { clamp, dot, forward, lerp, moveToward, right, wrapAngle } from '../util/math';
import type { CarInput, CarState } from './types';

/**
 * Smooth the steering toward the pressed direction. Turning in uses `steerRiseRate`;
 * letting go or flipping direction uses the (faster) `steerFallRate`.
 */
export function smoothSteer(current: number, target: number, car: CarTuning, dt: number): number {
  const t = clamp(target, -1, 1);
  const returning = t === 0 || Math.sign(t) !== Math.sign(current);
  const rate = returning && current !== 0 ? car.steerFallRate : car.steerRiseRate;
  return moveToward(current, t, rate * dt);
}

/**
 * How much of the full turn rate is available at this forward speed: ramps up from 0 when
 * stopped to 1 at `steerFullSpeed`, then eases down to `steerAtTopSpeed` at top speed.
 */
export function steerSpeedFactor(speed: number, topSpeed: number, car: CarTuning): number {
  const s = Math.abs(speed);
  if (s < car.steerFullSpeed) return s / car.steerFullSpeed;
  const t = clamp((s - car.steerFullSpeed) / Math.max(topSpeed - car.steerFullSpeed, 1e-6), 0, 1);
  return lerp(1, car.steerAtTopSpeed, t);
}

/** New forward speed after one tick of gas / brake / reverse / coasting. */
export function longitudinal(vF: number, input: CarInput, top: number, accel: number, car: CarTuning, dt: number): number {
  if (input.brake) {
    // Brake while rolling forward; once stopped, the brake key drives in reverse.
    if (vF > 0) return moveToward(vF, 0, car.brake * dt);
    if (input.gas) return vF; // both held while stopped: stay put
    return vF - car.reverseAccel * (1 + vF / car.reverseTopSpeed) * dt;
  }
  if (input.gas) {
    // Rolling backwards: gas brakes first.
    if (vF < 0) return moveToward(vF, 0, car.brake * dt);
    // Pull toward top speed. With accelCurve 1 the pull fades evenly (sluggish near the
    // top); higher values keep it strong until close to top speed. Above top speed (after
    // a ramp or later nitro) this turns negative and settles back down.
    return vF + accel * (1 - Math.pow(vF / top, car.accelCurve)) * dt;
  }
  return moveToward(vF, 0, (car.rollingResistance + Math.abs(vF) * car.drag) * dt);
}

/**
 * One tick of ground driving: steering, engine, brakes and grip. Changes `steer`, `yaw`,
 * `vx` and `vz` only. Position, height and walls are handled elsewhere.
 */
export function drive(state: CarState, input: CarInput, car: CarTuning, dt: number): void {
  const top = car.topSpeed * state.stats.speed;
  const accel = car.accel * state.stats.speed;

  state.steer = smoothSteer(state.steer, input.steer, car, dt);

  const f = forward(state.yaw);
  const r = right(state.yaw);
  const v = { x: state.vx, z: state.vz };
  let vF = dot(v, f);
  let vS = dot(v, r);

  vF = longitudinal(vF, input, top, accel, car, dt);

  // Grip removes sideways sliding. exp() keeps it the same at any tick rate.
  const grip = car.grip * state.stats.grip * (state.onSlick ? car.slickGrip : 1);
  vS *= Math.exp(-grip * dt);

  // Steer +1 = right = yaw goes down. Reversing flips the turn, like a real car.
  const yawRate = -state.steer * car.maxYawRate * steerSpeedFactor(vF, top, car) * Math.sign(vF);
  const turn = yawRate * dt;
  state.yaw = wrapAngle(state.yaw + turn);

  // Carve: the movement turns with the car (by `carve` of the turn), so the car follows the
  // corner instead of spinning in place and waiting for grip to catch up. On a slick, it
  // carves less and slides more.
  const carve = car.carve * (state.onSlick ? car.slickGrip : 1);
  const fc = forward(state.yaw - turn + turn * carve);
  const rc = right(state.yaw - turn + turn * carve);
  state.vx = fc.x * vF + rc.x * vS;
  state.vz = fc.z * vF + rc.z * vS;
}
