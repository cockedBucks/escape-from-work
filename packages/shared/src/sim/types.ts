import type { Track } from '../track/build';

/**
 * One car's merged input for one tick (Pilot steer + Engineer pedals, or a solo player).
 * Steer +1 = right. Keys give -1/0/1; bots may send anything in between.
 */
export interface CarInput {
  steer: number;
  gas: boolean;
  brake: boolean;
  respawn: boolean;
}

export const NO_INPUT: Readonly<CarInput> = { steer: 0, gas: false, brake: false, respawn: false };

/** Per-car multipliers from cars.json (around 1.0). */
export interface CarStats {
  speed: number;
  grip: number;
  weight: number;
}

/** Everything the sim knows about one car. Plain data: easy to copy, hash and send. */
export interface CarState {
  id: string;
  stats: CarStats;
  /** Ground position (m). */
  x: number;
  z: number;
  /** Height above the ground (m) and vertical speed (m/s, up = positive). */
  y: number;
  vy: number;
  /** Facing angle (rad). Forward = (sin yaw, cos yaw). Bigger yaw = turned left. */
  yaw: number;
  /** Ground velocity (m/s). */
  vx: number;
  vz: number;
  /** Smoothed steering, -1..1 (+1 = right). */
  steer: number;
  /** Centerline segment from the last lookup (hint for the next one). */
  segment: number;
  /** Lap progress 0–1 from the start line. */
  progress: number;
  /** Sideways offset from the centerline (m), + = right. */
  lateral: number;
  /** Last sector gate passed in order (0 = start line). Respawn goes here. */
  lastGate: number;
  /** On a slick zone (less grip). */
  onSlick: boolean;
  /** Inside a ramp zone: a ramp launches only on entry, not again while still on it. */
  onRamp: boolean;
  /** Tick when a fading respawn completes, or -1 when not respawning. */
  respawnAtTick: number;
  /** Ghosted (no car-vs-car collisions) until this tick. */
  ghostUntilTick: number;
}

/** Things that happened during a tick, for sound, effects, the HUD and the league. */
export type SimEvent =
  | { type: 'wallHit'; car: string; speed: number }
  | { type: 'jump'; car: string }
  | { type: 'land'; car: string; impact: number }
  | { type: 'checkpoint'; car: string; gate: number }
  | { type: 'respawnStart'; car: string; reason: 'button' | 'offTrack' }
  | { type: 'respawn'; car: string; gate: number };

export interface World {
  /** Ticks since the world was created. */
  tick: number;
  track: Track;
  /** Always sorted by id, so iteration order is deterministic. */
  cars: CarState[];
}
