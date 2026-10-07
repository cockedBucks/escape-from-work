import type { Tuning } from '../config/tuning';
import { dot, forward, right } from '../util/math';
import { isAirborne } from './air';
import type { CarState, SimEvent } from './types';

/** Can this car take part in a slipstream (give or get one)? Not while fading, ghosted or out. */
const inPlay = (car: CarState, now: number): boolean => car.respawnAtTick < 0 && car.ghostUntilTick <= now && !car.out && car.spinTicks === 0;

/** Is `follower` in the wake of `leader`: right behind it, close, facing the same way? */
export function inWake(follower: CarState, leader: CarState, cfg: Pick<Tuning, 'slipstream'>): boolean {
  const s = cfg.slipstream;
  const f = forward(follower.yaw);
  const d = { x: leader.x - follower.x, z: leader.z - follower.z };
  const along = dot(d, f);
  if (along <= 0 || along > s.range) return false;
  if (Math.abs(dot(d, right(follower.yaw))) > s.width) return false;
  return dot(f, forward(leader.yaw)) >= Math.cos(s.maxAngle);
}

/**
 * Slipstream for one tick (P13.4): a car close behind a rival at speed charges for
 * `slipstream.chargeSeconds`, then gets a boost (the drift-boost push) for
 * `slipstream.boostSeconds`, then none for `slipstream.cooldownSeconds` (a negative charge
 * counting back up), so a train of cars does not boost all the time. Out of the wake the charge
 * drains. Runs after every car moved, in id order (deterministic).
 */
export function stepSlipstream(cars: readonly CarState[], cfg: Tuning, now: number, events: SimEvent[]): void {
  const s = cfg.slipstream;
  const dt = cfg.sim.dt;
  for (const car of cars) {
    if (car.slipCharge < 0) {
      car.slipCharge = Math.min(0, car.slipCharge + dt); // cooling down after a slipstream boost
      continue;
    }
    const top = cfg.car.topSpeed * car.stats.speed;
    const fast = dot({ x: car.vx, z: car.vz }, forward(car.yaw)) >= s.minSpeedRatio * top;
    const drafting = fast && !isAirborne(car) && inPlay(car, now) && cars.some((o) => o !== car && inPlay(o, now) && inWake(car, o, cfg));
    if (!drafting) {
      car.slipCharge = Math.max(0, car.slipCharge - s.decayPerSec * dt);
      continue;
    }
    car.slipCharge += dt;
    if (car.slipCharge >= s.chargeSeconds) {
      car.slipCharge = -s.cooldownSeconds;
      car.boostTicks = Math.max(car.boostTicks, Math.round(s.boostSeconds / dt));
      events.push({ type: 'slipstream', car: car.id });
    }
  }
}
