import type { ChaosState } from '../items/chaos';
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
  /** Honk the horn (anyone in the car; once per press). */
  honk?: boolean;
  /** Burn nitro while held (Engineer or solo). */
  nitro?: boolean;
  /** Use the held item (Engineer or solo; once per press). */
  fire?: boolean;
  /** Aim the item backward while held (Pilot or solo). */
  aimBack?: boolean;
  /** Drift key held (Pilot or solo, Space): kart drift on the ground (P13.2). */
  drift?: boolean;
  /** Key presses this tick by anyone in the car (Forced Update: mash to finish faster). */
  mash?: number;
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
  /** Engine heat 0–1 (1 = stall). */
  heat: number;
  /** Stalled (no gas) until this tick, or -1 when the engine runs. */
  stallUntilTick: number;
  /** Drifting: 0 = no, -1 = drifting left, +1 = drifting right. */
  driftDir: number;
  /** Seconds charged in this drift, and the level reached (0–3: none, blue, orange, pink). */
  driftCharge: number;
  driftLevel: number;
  /** Ticks the drift key has been held in a row (0 = up). Letting go ends a drift (boost). */
  driftKeyTicks: number;
  /** Ticks of drift boost left (0 = none). */
  boostTicks: number;
  /** Nitro meter 0–1 (filled by drifts, burned by holding nitro). */
  nitro: number;
  /** Burning nitro this tick (speed push, extra heat, flames). */
  nitroOn: boolean;
  /** The lap this car is on, counted by the sim (1 = first lap; +1 at each finish-line crossing). */
  lap: number;
  /** Inside a swap lane (slower), and the lap of the last swap (0 = none; one swap per lap). */
  onSwap: boolean;
  swappedLap: number;
  /** One player drives alone (set by the server each tick): `solo.speedMultiplier` applies. */
  solo: boolean;
  /** The held item (an `ItemId`), or '' for an empty slot. */
  item: string;
  /** Spinning out (no control) for this many more ticks. */
  spinTicks: number;
  /** Firewall up for this many more ticks (absorbs one hit). */
  shieldTicks: number;
  /** Item effects on this car, ticks left: Blue Screen (both screens), Lag Spike (inputs late),
   * Control Swap (steering and pedals traded), Forced Update (stopped; mash keys). */
  blueScreenTicks: number;
  lagTicks: number;
  controlSwapTicks: number;
  updateTicks: number;
  /** Earliest tick the horn may sound again (cooldown). Cosmetic: not part of the replay hash. */
  nextHonkTick: number;
  /** Tick when a fading respawn completes, or -1 when not respawning. */
  respawnAtTick: number;
  /** Ghosted (no car-vs-car collisions) until this tick. */
  ghostUntilTick: number;
  /**
   * Out of a battle (P11.6, set by the server's battle rules): it picks up no item boxes. Always
   * false in a race, so it is not part of the replay hash.
   */
  out: boolean;
}

/** Things that happened during a tick, for sound, effects, the HUD and the league. */
export type SimEvent =
  | { type: 'wallHit'; car: string; speed: number }
  | { type: 'carHit'; car: string; other: string; speed: number }
  | { type: 'jump'; car: string }
  | { type: 'land'; car: string; impact: number }
  | { type: 'checkpoint'; car: string; gate: number }
  | { type: 'respawnStart'; car: string; reason: 'button' | 'offTrack' }
  | { type: 'respawn'; car: string; gate: number }
  | { type: 'honk'; car: string }
  | { type: 'stall'; car: string }
  /** A drift began (the kart hops into it): `dir` -1 left / +1 right. */
  | { type: 'driftStart'; car: string; dir: number }
  | { type: 'driftLevel'; car: string; level: number }
  | { type: 'boost'; car: string; level: number }
  | { type: 'nitro'; car: string }
  | { type: 'swap'; car: string }
  /** A car broke item box `box`; `item` = what it got (null: its slot was full). */
  | { type: 'itemBox'; car: string; box: number; item: string | null }
  /** `car` used its item. */
  | { type: 'itemUse'; car: string; item: string }
  /** `car` was hit by `item` from `by` (spin-out etc.), or its Firewall `blocked` it. */
  | { type: 'itemHit'; car: string; item: string; by: string; blocked: boolean }
  | { type: 'restart'; car: string };

export interface World {
  /** Ticks since the world was created. */
  tick: number;
  track: Track;
  /** Always sorted by id, so iteration order is deterministic. */
  cars: CarState[];
  /** Chaos mode (item boxes, items); absent = chaos off. */
  chaos?: ChaosState;
}
