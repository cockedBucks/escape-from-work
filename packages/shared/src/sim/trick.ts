import type { Tuning } from '../config/tuning';
import { isAirborne } from './air';
import type { CarState, SimEvent } from './types';

/**
 * Jump trick (P13.5): a fresh press of the drift key (Space: Pilot or Solo) while at least
 * `trick.minHeight` m in the air does a trick (the car spins); landing after it gives a boost
 * (the drift-boost push) for `trick.boostSeconds`. One trick per jump. Call after `stepDrift`
 * (which counts how long the key is held).
 */
export function stepTrick(car: CarState, cfg: Tuning, events: SimEvent[]): void {
  if (car.trick === 0 && isAirborne(car) && car.y >= cfg.trick.minHeight && car.driftKeyTicks === 1) {
    car.trick = 1;
    events.push({ type: 'trick', car: car.id });
  }
}

/** The car touched down this tick: a trick in the air pays out now. */
export function landTrick(car: CarState, cfg: Tuning, events: SimEvent[]): void {
  if (car.trick === 0) return;
  car.trick = 0;
  car.boostTicks = Math.max(car.boostTicks, Math.round(cfg.trick.boostSeconds / cfg.sim.dt));
  events.push({ type: 'trickLand', car: car.id });
}
