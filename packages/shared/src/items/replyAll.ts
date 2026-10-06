import type { Tuning } from '../config/tuning';
import { locateOnTrack } from '../track/locate';
import type { CarState, SimEvent, World } from '../sim/types';
import type { ChaosState } from './chaos';
import { canBeHit, hitCar, spinOut } from './effects';

/** A flying Reply-All envelope. */
export interface Envelope {
  id: number;
  owner: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Track segment hint for the wall check. */
  segment: number;
  ticksLeft: number;
  bounces: number;
  /** Can't hit its sender until this tick. */
  armedAtTick: number;
}

/** Fire: an envelope flies straight ahead of the car, or straight back when the Pilot aims back. */
export function fireReplyAll(chaos: ChaosState, car: CarState, aimBack: boolean, dt: number, now: number): void {
  const c = chaos.cfg.items.replyAll;
  const dir = aimBack ? -1 : 1;
  const fx = Math.sin(car.yaw) * dir;
  const fz = Math.cos(car.yaw) * dir;
  chaos.envelopes.push({
    id: chaos.nextId++,
    owner: car.id,
    x: car.x + fx * c.spawnAhead,
    z: car.z + fz * c.spawnAhead,
    vx: fx * c.speed,
    vz: fz * c.speed,
    segment: car.segment,
    ticksLeft: Math.round(c.lifeSeconds / dt),
    bounces: 0,
    armedAtTick: now + Math.round(c.armSeconds / dt),
  });
}

/**
 * Move every envelope one tick: bounce off the road edges (up to `bounces` times, then it is
 * gone), hit the first car it touches (spin-out, or a Firewall takes it), expire after its life.
 */
export function stepEnvelopes(world: World, chaos: ChaosState, cfg: Tuning, now: number, events: SimEvent[]): void {
  const c = chaos.cfg.items.replyAll;
  const dt = cfg.sim.dt;
  const reach2 = (c.radius + cfg.car.radius) ** 2;
  chaos.envelopes = chaos.envelopes.filter((e) => {
    e.ticksLeft--;
    if (e.ticksLeft <= 0) return false;
    e.x += e.vx * dt;
    e.z += e.vz * dt;
    // Road edge = wall: reflect the sideways part of the velocity.
    const loc = locateOnTrack(world.track, { x: e.x, z: e.z }, e.segment);
    e.segment = loc.segment;
    const over = Math.abs(loc.lateral) - (loc.halfWidth - c.radius);
    if (over > 0) {
      const r = world.track.samples[loc.segment]!.right;
      const out = Math.sign(loc.lateral);
      const vOut = (e.vx * r.x + e.vz * r.z) * out;
      if (vOut > 0) {
        e.bounces++;
        if (e.bounces > c.bounces) return false;
        e.vx -= 2 * vOut * out * r.x;
        e.vz -= 2 * vOut * out * r.z;
      }
      e.x -= r.x * out * over;
      e.z -= r.z * out * over;
    }
    for (const car of world.cars) {
      if (!canBeHit(car, now) || (car.id === e.owner && now < e.armedAtTick)) continue;
      if ((car.x - e.x) ** 2 + (car.z - e.z) ** 2 > reach2) continue;
      hitCar(car, 'replyAll', e.owner, events, () => spinOut(car, c.spinSeconds, dt));
      return false;
    }
    return true;
  });
}
