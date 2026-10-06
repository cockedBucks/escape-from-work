import type { CarState, SimEvent } from '../sim/types';

/** Can items touch this car right now? (Not while fading out to respawn or ghosted after it.) */
export const canBeHit = (car: CarState, now: number): boolean => car.respawnAtTick < 0 && car.ghostUntilTick <= now;

/**
 * An item hits `car`: a Firewall absorbs it (and is used up); otherwise `apply` runs. Always
 * emits `itemHit` (with `blocked`) so both players of the car, and the league, hear of it.
 */
export function hitCar(car: CarState, item: string, by: string, events: SimEvent[], apply: () => void): void {
  if (car.shieldTicks > 0) {
    car.shieldTicks = 0;
    events.push({ type: 'itemHit', car: car.id, item, by, blocked: true });
    return;
  }
  apply();
  events.push({ type: 'itemHit', car: car.id, item, by, blocked: false });
}

/**
 * Ctrl+Z: end every bad effect on the car (spin-out, a stalled engine; more items add theirs).
 * The heat itself goes back with the rest of the car (see `rewindCar`).
 */
export function clearBadEffects(car: CarState): void {
  car.spinTicks = 0;
  car.stallUntilTick = -1;
}

/** Start a spin-out of `seconds` (a car already spinning keeps its current one). */
export function spinOut(car: CarState, seconds: number, dt: number): void {
  if (car.spinTicks === 0) car.spinTicks = Math.round(seconds / dt);
}
