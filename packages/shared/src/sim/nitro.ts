import type { Tuning } from '../config/tuning';
import { isAirborne } from './air';
import type { CarInput, CarState, SimEvent } from './types';

/**
 * Nitro for one tick (GAME_DESIGN §5), before heat and driving: burns while the button is
 * held, there is meter left, the engine runs and the car is on the ground (a push in the air
 * would do nothing). The push happens in `drive`, the extra heat
 * in `stepHeat`. Emits `nitro` when a burn starts.
 */
export function stepNitro(car: CarState, input: CarInput, cfg: Tuning, now: number, events: SimEvent[]): void {
  const was = car.nitroOn;
  car.nitroOn = (input.nitro ?? false) && car.nitro > 0 && car.stallUntilTick <= now && car.respawnAtTick < 0 && !isAirborne(car);
  if (!car.nitroOn) return;
  car.nitro = Math.max(0, car.nitro - cfg.nitro.burnPerSec * cfg.sim.dt);
  if (!was) events.push({ type: 'nitro', car: car.id });
}
