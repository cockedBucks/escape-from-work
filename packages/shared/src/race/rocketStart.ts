// Rocket start (P13.3): the Engineer (or Solo) times the gas in the countdown, like a kart racer.
// Pressed in the last `rocket.windowSeconds` before "CLOCK OUT!" and still held at GO: a boost.
// Held since more than `rocket.floodSeconds` before GO: the engine floods (a short stall with
// smoke, a sputter and a "FLOODED!" bubble). In between, or not held at GO: a normal start.
// Pure rules; the server feeds the countdown inputs in and applies the result at GO.
import type { Tuning } from '../config/tuning';
import type { CarState, SimEvent } from '../sim/types';

/** Per car: the tick its gas went down in this countdown and is still held (null = not held). */
export type RocketTracker = Map<string, number | null>;

/** One countdown tick: remember when each car's gas went down (a release forgets it). */
export function trackCountdownGas(tracker: RocketTracker, carId: string, gas: boolean, tick: number): void {
  if (!gas) tracker.set(carId, null);
  else if ((tracker.get(carId) ?? null) === null) tracker.set(carId, tick);
}

export type RocketResult = 'rocket' | 'flooded' | 'normal';

/** How a start went: `pressedAt` = tick the held gas went down (null = not held at GO). */
export function rocketResult(pressedAt: number | null, goTick: number, cfg: Pick<Tuning, 'rocket' | 'sim'>): RocketResult {
  if (pressedAt === null) return 'normal';
  const early = (goTick - pressedAt) * cfg.sim.dt;
  if (early <= cfg.rocket.windowSeconds) return 'rocket';
  if (early > cfg.rocket.floodSeconds) return 'flooded';
  return 'normal';
}

/**
 * At GO: give every car its start. `botSkill` = skill of each bot car (bots with
 * `rocket.botSkill` or more nail it). Returns the events (`rocketStart`, `flooded`).
 */
export function applyRocketStarts(
  cars: readonly CarState[],
  tracker: RocketTracker,
  goTick: number,
  cfg: Tuning,
  botSkill: ReadonlyMap<string, number> = new Map(),
): SimEvent[] {
  const events: SimEvent[] = [];
  const dt = cfg.sim.dt;
  for (const car of cars) {
    const skill = botSkill.get(car.id);
    const result = skill !== undefined ? (skill >= cfg.rocket.botSkill ? 'rocket' : 'normal') : rocketResult(tracker.get(car.id) ?? null, goTick, cfg);
    if (result === 'rocket') {
      car.boostTicks = Math.round(cfg.rocket.boostSeconds / dt);
      events.push({ type: 'rocketStart', car: car.id });
    } else if (result === 'flooded') {
      car.stallUntilTick = goTick + Math.round(cfg.rocket.floodStallSeconds / dt);
      events.push({ type: 'flooded', car: car.id });
    }
  }
  return events;
}
