import type { CarState, World } from './types';

/**
 * A short fingerprint of the world (tick + every car's state), for replay tests: same
 * inputs must give the same hash. FNV-1a over the exact bits of every number, so even a
 * one-bit float difference changes it.
 */
export function hashWorld(world: World): string {
  const buf = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  const byte = (b: number): void => {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const num = (v: number): void => {
    buf.setFloat64(0, v);
    for (let i = 0; i < 8; i++) byte(buf.getUint8(i));
  };
  const str = (s: string): void => {
    for (let i = 0; i < s.length; i++) num(s.charCodeAt(i));
  };

  num(world.tick);
  for (const c of world.cars) {
    str(c.id);
    num(c.stats.speed);
    num(c.stats.grip);
    num(c.stats.weight);
    for (const key of CAR_HASH_KEYS) {
      const v = c[key];
      num(typeof v === 'boolean' ? (v ? 1 : 0) : v);
    }
    str(c.item);
  }
  // Chaos mode only (a world without it hashes exactly as before).
  if (world.chaos) {
    num(world.chaos.rng);
    for (const b of world.chaos.boxes) {
      num(b.x);
      num(b.z);
      num(b.respawnAtTick);
    }
    for (const e of world.chaos.envelopes) {
      str(e.owner);
      for (const v of [e.x, e.z, e.vx, e.vz, e.ticksLeft, e.bounces, e.armedAtTick]) num(v);
    }
    for (const p of world.chaos.puddles) {
      str(p.owner);
      for (const v of [p.x, p.z, p.ticksLeft, p.ownerSafeUntilTick]) num(v);
      for (const id of p.hit) str(id);
    }
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Every number/boolean field of CarState that affects driving, in a fixed order.
 * `nextHonkTick` (honk cooldown) is left out on purpose: honking is cosmetic (D063).
 */
const CAR_HASH_KEYS = [
  'x', 'z', 'y', 'vy', 'yaw', 'vx', 'vz', 'steer', 'segment', 'progress', 'lateral',
  'lastGate', 'onSlick', 'onRamp', 'respawnAtTick', 'ghostUntilTick', 'heat', 'stallUntilTick',
  'driftDir', 'driftCharge', 'driftLevel', 'straightTicks', 'brakeTicks', 'boostTicks', 'nitro', 'nitroOn',
  'lap', 'onSwap', 'swappedLap', 'solo', 'spinTicks', 'shieldTicks',
] as const satisfies readonly (keyof CarState)[];
