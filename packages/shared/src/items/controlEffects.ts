import type { Tuning } from '../config/tuning';
import type { CarInput, CarState } from '../sim/types';
import type { ChaosState } from './chaos';

/** Recent driving inputs of one car (fixed slots, reused): Lag Spike plays them back late. */
export interface InputLog {
  inputs: CarInput[];
  next: number;
}

const blank = (): CarInput => ({ steer: 0, gas: false, brake: false, respawn: false, nitro: false });

/**
 * Control Swap: the Pilot's steering now works the pedals (right = gas, left = brake) and the
 * Engineer's pedals steer (gas = left, brake = right). Works the same for a solo player.
 */
export function swapControls(input: CarInput, out: CarInput): CarInput {
  out.steer = (input.brake ? 1 : 0) - (input.gas ? 1 : 0);
  out.gas = input.steer > 0.5;
  out.brake = input.steer < -0.5;
  out.nitro = input.nitro;
  out.respawn = input.respawn;
  return out;
}

/**
 * The driving input a car really gets this tick under item effects: a Lag Spike plays back its
 * input from `lagSpike.delaySeconds` ago, a Control Swap trades steering and pedals, and a
 * Forced Update holds it still (brakes on) while key mashes count the update down. Every
 * car's raw input is logged each tick so a Lag Spike can start at any moment.
 */
export function applyControlEffects(chaos: ChaosState, car: CarState, raw: CarInput, cfg: Tuning): CarInput {
  const delay = Math.max(1, Math.round(chaos.cfg.items.lagSpike.delaySeconds / cfg.sim.dt));
  let log = chaos.inputLog[car.id];
  if (!log) {
    log = { inputs: Array.from({ length: delay + 1 }, blank), next: 0 };
    chaos.inputLog[car.id] = log;
  }
  const slot = log.inputs[log.next]!;
  slot.steer = raw.steer;
  slot.gas = raw.gas;
  slot.brake = raw.brake;
  slot.nitro = raw.nitro ?? false;
  slot.respawn = raw.respawn;
  const size = log.inputs.length;
  log.next = (log.next + 1) % size;

  let input = raw;
  if (car.lagTicks > 0) {
    car.lagTicks--;
    // The oldest slot is `delay` ticks back; respawn stays instant (it is a rescue button).
    const late = log.inputs[log.next % size]!;
    input = { ...late, respawn: raw.respawn, fire: raw.fire, aimBack: raw.aimBack };
  }
  if (car.controlSwapTicks > 0) {
    car.controlSwapTicks--;
    input = swapControls(input, { ...input });
  }
  if (car.updateTicks > 0) {
    const mash = Math.round(chaos.cfg.items.forcedUpdate.mashSeconds / cfg.sim.dt);
    car.updateTicks = Math.max(0, car.updateTicks - 1 - (raw.mash ?? 0) * mash);
    return { steer: 0, gas: false, brake: true, respawn: raw.respawn };
  }
  return input;
}
