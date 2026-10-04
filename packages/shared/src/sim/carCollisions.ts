import type { CarTuning } from '../config/tuning';
import { isAirborne } from './air';
import type { CarState, SimEvent } from './types';

/**
 * Car-vs-car bumps: overlapping circles are pushed apart and bounce, split by weight, so a
 * heavy car shoves a light one more. Ghosted cars (just respawned) pass through, and a car
 * in the air flies over the others. Pairs go in id order (cars are sorted): deterministic.
 */
export function collideCars(cars: CarState[], tick: number, car: CarTuning, events: SimEvent[]): void {
  const minDist = car.radius * 2;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i] as CarState;
    if (a.ghostUntilTick > tick || a.respawnAtTick >= 0 || isAirborne(a)) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j] as CarState;
      if (b.ghostUntilTick > tick || b.respawnAtTick >= 0 || isAirborne(b)) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minDist * minDist) continue;
      const d = Math.sqrt(d2);
      // Exactly on top of each other: push along X (any fixed direction keeps it deterministic).
      const nx = d > 1e-9 ? dx / d : 1;
      const nz = d > 1e-9 ? dz / d : 0;
      const wa = a.stats.weight;
      const wb = b.stats.weight;
      const total = wa + wb;

      // Push apart: the lighter car moves more.
      const pen = minDist - d;
      a.x -= nx * pen * (wb / total);
      a.z -= nz * pen * (wb / total);
      b.x += nx * pen * (wa / total);
      b.z += nz * pen * (wa / total);

      // Bounce: only when they are moving toward each other.
      const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (closing >= 0) continue;
      const impulse = (-(1 + car.carBounce) * closing) / (1 / wa + 1 / wb);
      a.vx -= (nx * impulse) / wa;
      a.vz -= (nz * impulse) / wa;
      b.vx += (nx * impulse) / wb;
      b.vz += (nz * impulse) / wb;
      if (-closing >= car.carHitMinSpeed) events.push({ type: 'carHit', car: a.id, other: b.id, speed: -closing });
    }
  }
}
