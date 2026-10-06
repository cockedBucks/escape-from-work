import type { Tuning } from '../config/tuning';
import type { CarState, SimEvent, World } from '../sim/types';
import type { ChaosState } from './chaos';
import { canBeHit, hitCar, spinOut } from './effects';

/** A Coffee Spill puddle on the road. */
export interface Puddle {
  id: number;
  owner: string;
  x: number;
  z: number;
  ticksLeft: number;
  /** Its owner can't slip on it until this tick. */
  ownerSafeUntilTick: number;
  /** Cars that already slipped on it: once each (no getting stuck spinning in it). */
  hit: string[];
}

/** Drop a puddle behind the car. */
export function dropCoffee(chaos: ChaosState, car: CarState, dt: number, now: number): void {
  const c = chaos.cfg.items.coffeeSpill;
  chaos.puddles.push({
    id: chaos.nextId++,
    owner: car.id,
    x: car.x - Math.sin(car.yaw) * c.dropBack,
    z: car.z - Math.cos(car.yaw) * c.dropBack,
    ticksLeft: Math.round(c.seconds / dt),
    ownerSafeUntilTick: now + Math.round(c.ownerGraceSeconds / dt),
    hit: [],
  });
}

/** Puddles dry up after their life; a car driving in spins out once (unless already spinning). */
export function stepPuddles(world: World, chaos: ChaosState, cfg: Tuning, now: number, events: SimEvent[]): void {
  const c = chaos.cfg.items.coffeeSpill;
  const dt = cfg.sim.dt;
  const reach2 = c.radius ** 2;
  chaos.puddles = chaos.puddles.filter((p) => {
    p.ticksLeft--;
    if (p.ticksLeft <= 0) return false;
    for (const car of world.cars) {
      if (!canBeHit(car, now) || car.spinTicks > 0 || p.hit.includes(car.id) || (car.id === p.owner && now < p.ownerSafeUntilTick)) continue;
      if ((car.x - p.x) ** 2 + (car.z - p.z) ** 2 > reach2) continue;
      p.hit.push(car.id);
      hitCar(car, 'coffeeSpill', p.owner, events, () => spinOut(car, c.spinSeconds, dt));
    }
    return true;
  });
}
