import type { Tuning } from '../config/tuning';
import { isAirborne } from './air';
import type { CarInput, CarState, SimEvent } from './types';

/** Forget any drift and boost (respawn). The nitro meter stays. */
export function resetDrift(car: CarState): void {
  car.driftDir = 0;
  car.driftCharge = 0;
  car.driftLevel = 0;
  car.boostTicks = 0;
}

function endDrift(car: CarState, reward: boolean, cfg: Tuning, events: SimEvent[]): void {
  const level = car.driftLevel;
  if (reward && level > 0) {
    const d = cfg.drift;
    car.boostTicks = Math.round(d.boostSeconds[level - 1]! / cfg.sim.dt);
    car.nitro = Math.min(1, car.nitro + d.nitroPerLevel[level - 1]!);
    events.push({ type: 'boost', car: car.id, level });
  }
  car.driftDir = 0;
  car.driftCharge = 0;
  car.driftLevel = 0;
  car.straightTicks = 0;
}

/**
 * Tandem drift for one tick (GAME_DESIGN §5), before driving. Starts on a brake press while
 * steering hard at speed; charges levels while held; ends when the steering has been
 * straight for `drift.releaseMs` (so a quick key tap does not end it; boost + nitro if on the
 * gas), when the brake is held too long (it was braking), or when too slow. The brake tap that starts a drift does not slow the car. `vF` = forward speed.
 * Returns the input to drive with.
 */
export function stepDrift(car: CarState, input: CarInput, vF: number, cfg: Tuning, events: SimEvent[]): CarInput {
  const d = cfg.drift;
  const dt = cfg.sim.dt;
  const top = cfg.car.topSpeed * car.stats.speed;
  if (car.boostTicks > 0) car.boostTicks--;
  const pressed = input.brake && car.brakeTicks === 0;
  car.brakeTicks = input.brake ? car.brakeTicks + 1 : 0;

  if (car.driftDir === 0) {
    if (!pressed || isAirborne(car) || Math.abs(car.steer) < d.minSteer || vF < d.minSpeedRatio * top) return input;
    car.driftDir = Math.sign(car.steer);
    car.driftCharge = 0;
    car.driftLevel = 0;
  } else if (car.brakeTicks > Math.round(d.brakeTapMaxMs / 1000 / dt)) {
    endDrift(car, false, cfg, events);
    return input; // a long press is real braking
  } else if (vF < d.exitSpeedRatio * top) {
    endDrift(car, false, cfg, events);
    return input;
  } else if (Math.abs(input.steer) < d.releaseSteer) {
    car.straightTicks++;
    if (car.straightTicks >= Math.round(d.releaseMs / 1000 / dt)) {
      endDrift(car, input.gas, cfg, events);
      return input;
    }
  } else {
    car.straightTicks = 0;
  }

  car.driftCharge += dt;
  let level = 0;
  while (level < d.levelSeconds.length && car.driftCharge >= d.levelSeconds[level]!) level++;
  if (level > car.driftLevel) {
    car.driftLevel = level;
    events.push({ type: 'driftLevel', car: car.id, level });
  }
  return input.brake ? { ...input, brake: false } : input;
}
