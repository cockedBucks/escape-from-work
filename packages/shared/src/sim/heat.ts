import type { Tuning } from '../config/tuning';
import { clamp } from '../util/math';
import type { CarInput, CarState, SimEvent } from './types';

/** Is the engine stalled right now (no gas until it restarts)? */
export const isStalled = (car: CarState, tick: number): boolean => car.stallUntilTick > tick;

/**
 * Engine heat for one tick (GAME_DESIGN §5). Full gas at speed heats the engine, off the gas
 * or braking cools it, gas at low speed holds it. At full heat the engine stalls for
 * `heat.stallSeconds`, then restarts at `heat.restartHeat`. Returns the input to drive with:
 * no gas while stalled (brake and steering still work).
 */
export function stepHeat(car: CarState, input: CarInput, speed: number, cfg: Tuning, now: number, events: SimEvent[]): CarInput {
  const h = cfg.heat;
  const dt = cfg.sim.dt;
  if (car.stallUntilTick >= 0) {
    if (now < car.stallUntilTick) return input.gas ? { ...input, gas: false } : input;
    car.stallUntilTick = -1;
    car.heat = h.restartHeat;
    events.push({ type: 'restart', car: car.id });
  }
  const top = cfg.car.topSpeed * car.stats.speed;
  if (!input.gas || input.brake) car.heat -= h.coolPerSec * dt;
  else if (speed >= h.hotSpeedFraction * top) car.heat += h.risePerSec * dt;
  car.heat = clamp(car.heat, 0, 1);
  if (car.heat >= 1) {
    car.stallUntilTick = now + Math.round(h.stallSeconds / dt);
    events.push({ type: 'stall', car: car.id });
    return input.gas ? { ...input, gas: false } : input;
  }
  return input;
}
