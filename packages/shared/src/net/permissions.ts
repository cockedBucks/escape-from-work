import type { Role } from '../race/seats';
import { NO_INPUT, type CarInput } from '../sim/types';

/** Controls that belong to a seat (ARCHITECTURE §6 input merge table). */
export type Control = 'steer' | 'gas' | 'brake' | 'respawn' | 'honk';

/**
 * Which role may use which control. The Pilot steers, the Engineer runs the pedals, Solo
 * does everything, and anyone in the car may respawn it or honk. (Aim, nitro, fire join later.)
 */
export const ROLE_CONTROLS: Readonly<Record<Role, readonly Control[]>> = {
  pilot: ['steer', 'respawn', 'honk'],
  engineer: ['gas', 'brake', 'respawn', 'honk'],
  solo: ['steer', 'gas', 'brake', 'respawn', 'honk'],
};

export const mayUse = (role: Role, control: Control): boolean => ROLE_CONTROLS[role].includes(control);

/** One player's part of a car's input. */
export interface InputPart {
  role: Role;
  input: CarInput;
}

/**
 * Build a car's input from its players: every control comes only from a role that may use
 * it; anything else a client sends is ignored. Respawn: any player may press it.
 */
export function mergeCarInput(parts: readonly InputPart[]): CarInput {
  const out: CarInput = { ...NO_INPUT };
  for (const { role, input } of parts) {
    if (mayUse(role, 'steer')) out.steer = input.steer;
    if (mayUse(role, 'gas')) out.gas = input.gas;
    if (mayUse(role, 'brake')) out.brake = input.brake;
    if (mayUse(role, 'respawn') && input.respawn) out.respawn = true;
    if (mayUse(role, 'honk') && input.honk) out.honk = true;
  }
  return out;
}
