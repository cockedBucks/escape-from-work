import type { Tuning } from '../config/tuning';
import { clamp } from '../util/math';
import type { CarInput, CarState, SimEvent } from './types';

/** Is the engine stalled right now (no gas until it restarts)? */
export const isStalled = (car: CarState, tick: number): boolean => car.stallUntilTick > tick;

/**
 * Engine heat for one tick (GAME_DESIGN §5). Burning nitro heats the engine
 * (`heat.nitroRisePerSec`); full gas at speed can too (`heat.risePerSec`, 0 since the first
 * duo playtest). Whenever nothing heats it, it cools: fast off the gas or braking
 * (`coolPerSec`), slowly while driving on the gas (`coolOnGasPerSec`). At full heat the engine
 * stalls for `heat.stallSeconds`, then restarts at `heat.restartHeat`. Returns the input to drive with:
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
  const onGas = input.gas && !input.brake;
  const gasHeat = onGas && speed >= h.hotSpeedFraction * top ? h.risePerSec : 0;
  const rise = gasHeat + (car.nitroOn ? h.nitroRisePerSec : 0);
  if (rise > 0) car.heat += rise * dt;
  else car.heat -= (onGas ? h.coolOnGasPerSec : h.coolPerSec) * dt;
  car.heat = clamp(car.heat, 0, 1);
  if (car.heat >= 1) {
    car.stallUntilTick = now + Math.round(h.stallSeconds / dt);
    events.push({ type: 'stall', car: car.id });
    return input.gas ? { ...input, gas: false } : input;
  }
  return input;
}
