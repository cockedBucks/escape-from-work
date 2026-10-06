import type { Tuning } from '../config/tuning';
import type { CarState } from '../sim/types';

const NONE = { fire: false, aimBack: false } as const;

/** Is `other` within `range` m and `cone` rad of where `car` faces (`dir` +1 ahead, -1 behind)? */
function inSights(car: CarState, other: CarState, dir: 1 | -1, cone: number, range: number): boolean {
  const dx = other.x - car.x;
  const dz = other.z - car.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6 || d > range) return false;
  const along = (dx * Math.sin(car.yaw) + dz * Math.cos(car.yaw)) * dir;
  return along / d >= Math.cos(cone);
}

/** Is anything going wrong for this car that Ctrl+Z would undo? */
const inTrouble = (car: CarState): boolean =>
  car.spinTicks > 0 || car.stallUntilTick >= 0 || car.updateTicks > 0 || car.controlSwapTicks > 0 || car.lagTicks > 0 || car.blueScreenTicks > 0;

/**
 * When a bot uses its item (skill ≥ 1; plain bots never do). Firewall and the targeted items
 * (Blue Screen, Lag Spike, Control Swap, Forced Update) go at once; Ctrl+Z waits for trouble;
 * Reply-All waits for a car in its sights ahead (or behind: the Pilot aims back); Coffee Spill
 * waits for a car close behind. `others` = the other cars.
 */
export function botItem(car: CarState, others: readonly CarState[], cfg: Tuning, skill: number): { fire: boolean; aimBack: boolean } {
  if (skill < 1 || car.item === '' || car.respawnAtTick >= 0) return NONE;
  const { itemAimCone: cone, itemAimRange: range, itemDropRange: drop } = cfg.bot;
  switch (car.item) {
    case 'ctrlZ':
      return { fire: inTrouble(car), aimBack: false };
    case 'replyAll': {
      if (others.some((o) => o.id !== car.id && inSights(car, o, 1, cone, range))) return { fire: true, aimBack: false };
      if (others.some((o) => o.id !== car.id && inSights(car, o, -1, cone, range))) return { fire: true, aimBack: true };
      return NONE;
    }
    case 'coffeeSpill':
      return { fire: others.some((o) => o.id !== car.id && inSights(car, o, -1, cone * 2, drop)), aimBack: false };
    default:
      // Firewall, Blue Screen, Lag Spike, Control Swap, Forced Update: no reason to wait.
      return { fire: true, aimBack: false };
  }
}
