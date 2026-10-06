import type { Tuning } from '../config/tuning';
import type { CarState, World } from '../sim/types';
import type { ChaosState } from './chaos';
import { clearBadEffects } from './effects';

/** Where a car was at one moment (enough to put it back there), and how hot its engine was. */
export interface PoseSample {
  x: number;
  z: number;
  y: number;
  vy: number;
  yaw: number;
  vx: number;
  vz: number;
  segment: number;
  progress: number;
  lateral: number;
  lastGate: number;
  lap: number;
  heat: number;
}

/** A car's last `ctrlZ.seconds` of poses, one every `ctrlZ.sampleSeconds` (fixed slots, reused). */
export interface CarHistory {
  samples: PoseSample[];
  next: number;
  count: number;
}

const POSE_KEYS = ['x', 'z', 'y', 'vy', 'yaw', 'vx', 'vz', 'segment', 'progress', 'lateral', 'lastGate', 'lap', 'heat'] as const satisfies readonly (keyof PoseSample & keyof CarState)[];

const emptySample = (): PoseSample => ({ x: 0, z: 0, y: 0, vy: 0, yaw: 0, vx: 0, vz: 0, segment: 0, progress: 0, lateral: 0, lastGate: 0, lap: 1, heat: 0 });

/**
 * Every `ctrlZ.sampleSeconds`, remember each car's pose. History is derived from the world
 * (same inputs = same history), so it is not part of the replay hash.
 */
export function recordHistory(world: World, chaos: ChaosState, cfg: Tuning, now: number): void {
  const c = chaos.cfg.items.ctrlZ;
  const every = Math.max(1, Math.round(c.sampleSeconds / cfg.sim.dt));
  if (now % every !== 0) return;
  const capacity = Math.round(c.seconds / c.sampleSeconds) + 1;
  for (const car of world.cars) {
    let h = chaos.history[car.id];
    if (!h) {
      h = { samples: Array.from({ length: capacity }, emptySample), next: 0, count: 0 };
      chaos.history[car.id] = h;
    }
    const s = h.samples[h.next]!;
    for (const k of POSE_KEYS) s[k] = car[k];
    h.next = (h.next + 1) % capacity;
    h.count = Math.min(h.count + 1, capacity);
  }
}

/**
 * Ctrl+Z: put the car back where it was `ctrlZ.seconds` ago (or as far back as it has been
 * driving), clear bad effects on it, and ghost it briefly so it never lands inside a car.
 */
export function rewindCar(chaos: ChaosState, car: CarState, cfg: Tuning, now: number): void {
  const h = chaos.history[car.id];
  if (h && h.count > 0) {
    const capacity = h.samples.length;
    const oldest = h.samples[(h.next - h.count + capacity) % capacity]!;
    for (const k of POSE_KEYS) car[k] = oldest[k];
    // The rewound path is history now: the next Ctrl+Z goes back from here.
    h.count = 0;
  }
  car.driftDir = 0;
  car.driftCharge = 0;
  car.driftLevel = 0;
  car.ghostUntilTick = now + Math.round(cfg.race.respawnGhostSeconds / cfg.sim.dt);
  clearBadEffects(car);
}
