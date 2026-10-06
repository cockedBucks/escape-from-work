import {
  NO_INPUT,
  angleDiff,
  createCar,
  createWorld,
  lapProgress,
  locateOnTrack,
  mayUse,
  step,
  type CarInput,
  type CarState,
  type CarStats,
  type Role,
  type Track,
  type Tuning,
  type World,
} from '@escape/shared';
import type { CarSnap } from './snapshots';

/** The synced fields of your own car that prediction starts from. */
export interface OwnCarView {
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  vy: number;
  steer: number;
  respawning: boolean;
  ghost: boolean;
  heat: number;
  /** Seconds until a stalled engine restarts (0 = running). */
  stallLeft: number;
  drift: number;
  driftLevel: number;
  driftCharge: number;
  /** Seconds of drift boost left; seconds the steering has been straight in this drift. */
  boostLeft: number;
  driftStraight: number;
  onSwap: boolean;
  nitro: number;
  nitroOn: boolean;
  solo: boolean;
  /** Seconds left spinning out (item hit): not predicted, drawn from the server. */
  spinLeft: number;
  /** Merged input the server applied (your partner's half comes from here). */
  inSteer: number;
  inGas: boolean;
  inBrake: boolean;
  inNitro: boolean;
}

/** A server update this far (m) from the last one is a teleport: do not reuse the track hint. */
const HINT_MAX_JUMP = 15;

/**
 * Client-side prediction for YOUR car only (FUN GATE: steering felt a bit laggy).
 *
 * Every server update gives a fresh starting point. Each frame we run the shared physics
 * from there, ahead by (time since that update + input echo time), with your own keys for
 * the controls your role owns and the server's last input for your partner's. The car
 * therefore answers your keys at once, the server stays in charge, and when the server
 * disagrees the difference fades out (`net.predictCorrectionRate`) instead of snapping.
 * Other cars stay interpolated. Car-vs-car bumps are not predicted.
 *
 * Per frame it reuses its objects; only the sim's own per-step event list is allocated.
 */
/** A server state to predict from: the car, when it happened, and its timers in seconds. */
interface Base {
  car: CarState;
  time: number;
  stallLeft: number;
  boostLeft: number;
  straight: number;
}

export class OwnCarPredictor {
  private id = '';
  private world: World | null = null;
  private base: Base | null = null;
  /** The base before the latest one: where the car was being drawn from until this update. */
  private prev: Base | null = null;
  private readonly serverInput: CarInput = { ...NO_INPUT };
  private readonly input: CarInput = { ...NO_INPUT };
  private inputs: Record<string, CarInput> = {};
  /** Was the car drawn from a prediction last frame? (Corrections only blend from one.) */
  private shown = false;
  private readonly off = { x: 0, z: 0, yaw: 0 };
  private readonly pose = { x: 0, y: 0, z: 0, yaw: 0 };
  private needOffset = false;
  private lastNow = -1;

  /** `stats`: your car's stats from cars.json (the server uses the same). */
  constructor(
    private readonly track: Track,
    private stats: CarStats,
  ) {}

  setStats(stats: CarStats): void {
    this.stats = { ...stats };
  }

  /**
   * A server update for your car. `time` is when it happened on the client timeline (the
   * same smoothed, tick-based timeline the other cars use, so arrival jitter is ignored).
   */
  onServer(id: string, view: OwnCarView, time: number): void {
    if (id !== this.id) {
      // A different car (seat change): nothing from the old one carries over.
      this.id = id;
      this.world = createWorld(this.track, [createCar(id, this.stats, this.track)]);
      this.inputs = { [id]: this.input };
      this.base = null;
      this.prev = null;
      this.shown = false;
      this.off.x = this.off.z = this.off.yaw = 0;
    }
    const prev = this.base?.car ?? null;
    const near = prev !== null && Math.hypot(prev.x - view.x, prev.z - view.z) < HINT_MAX_JUMP;
    const car = createCar(id, this.stats, this.track);
    car.x = view.x;
    car.z = view.z;
    car.y = view.y;
    car.vy = view.vy;
    car.yaw = view.yaw;
    car.vx = view.vx;
    car.vz = view.vz;
    car.steer = view.steer;
    car.respawnAtTick = view.respawning ? 1 : -1;
    car.heat = view.heat;
    car.driftDir = view.drift;
    car.driftLevel = view.driftLevel;
    car.driftCharge = view.driftCharge;
    car.nitro = view.nitro;
    car.nitroOn = view.nitroOn;
    car.solo = view.solo;
    car.onSwap = view.onSwap;
    car.spinTicks = view.spinLeft > 0 ? 1 : 0;
    // The brake as the server last applied it: held = no fresh press to start a drift with.
    car.brakeTicks = view.inBrake ? 1 : 0;
    const loc = locateOnTrack(this.track, { x: view.x, z: view.z }, near ? prev.segment : undefined);
    car.segment = loc.segment;
    car.progress = lapProgress(this.track, loc.progress);
    car.lateral = loc.lateral;
    // Two updates before a frame was drawn: keep blending from the one actually drawn last.
    if (!this.needOffset) this.prev = this.base;
    this.base = { car, time, stallLeft: view.stallLeft, boostLeft: view.boostLeft, straight: view.driftStraight };
    this.serverInput.steer = view.inSteer;
    this.serverInput.gas = view.inGas;
    this.serverInput.brake = view.inBrake;
    this.serverInput.nitro = view.inNitro;
    this.needOffset = this.shown;
  }

  /**
   * Run the physics from `base` to client time `now` (+ lead) and leave the blended pose in
   * `this.pose`; the world's car is left at the next whole tick (for speed and steering).
   */
  private poseAt(base: Base, now: number, leadMs: number, cfg: Tuning): CarState {
    const world = this.world as World;
    const dtMs = cfg.sim.dt * 1000;
    const aheadMs = Math.min(Math.max(now - base.time + leadMs, 0), cfg.net.predictMaxMs);
    const ticks = aheadMs / dtMs;
    const whole = Math.floor(ticks);
    const frac = ticks - whole;
    const car = world.cars[0] as CarState;
    Object.assign(car, base.car);
    world.tick = 0;
    car.stallUntilTick = base.stallLeft > 0 ? Math.round(base.stallLeft / cfg.sim.dt) : -1;
    car.boostTicks = Math.round(base.boostLeft / cfg.sim.dt);
    car.straightTicks = Math.round(base.straight / cfg.sim.dt);
    for (let i = 0; i < whole; i++) step(world, this.inputs, cfg);
    const ax = car.x;
    const az = car.z;
    const ay = car.y;
    const ayaw = car.yaw;
    step(world, this.inputs, cfg);
    // Blend between whole ticks so the car moves smoothly at any frame rate.
    this.pose.x = ax + (car.x - ax) * frac;
    this.pose.z = az + (car.z - az) * frac;
    this.pose.y = ay + (car.y - ay) * frac;
    this.pose.yaw = ayaw + angleDiff(ayaw, car.yaw) * frac;
    return car;
  }

  /**
   * Fill `out` with your car's predicted pose at client time `now`. Returns false when
   * prediction is off or not possible (then draw the interpolated car instead).
   */
  predict(now: number, local: CarInput, role: Role | null, leadMs: number, cfg: Tuning, out: CarSnap): boolean {
    const world = this.world;
    const base = this.base;
    // Not while respawning or spinning out (an item hit): the server's car is drawn as it is.
    if (!world || !base || role === null || cfg.net.predictMaxMs <= 0 || base.car.respawnAtTick >= 0 || base.car.spinTicks > 0) {
      this.shown = false;
      return false;
    }
    const input = this.input;
    input.steer = mayUse(role, 'steer') ? local.steer : this.serverInput.steer;
    input.gas = mayUse(role, 'gas') ? local.gas : this.serverInput.gas;
    input.brake = mayUse(role, 'brake') ? local.brake : this.serverInput.brake;
    input.nitro = mayUse(role, 'nitro') ? (local.nitro ?? false) : (this.serverInput.nitro ?? false);
    input.respawn = false;

    // Disagreements with the server fade out at `net.predictCorrectionRate`.
    const frameDt = this.lastNow < 0 ? 0 : Math.max(now - this.lastNow, 0) / 1000;
    this.lastNow = now;
    const keep = Math.exp(-cfg.net.predictCorrectionRate * frameDt);
    this.off.x *= keep;
    this.off.z *= keep;
    this.off.yaw *= keep;

    // A fresh server state moved the prediction: keep drawing the car exactly where the old
    // prediction puts it THIS frame and let the difference fade, so an update is never a
    // visible step (measuring from last frame's spot held the car back a frame every update:
    // the "stutter" from the P5 duo playtest).
    let ox = 0;
    let oz = 0;
    let oyaw = 0;
    const blend = this.needOffset && this.prev !== null;
    if (blend) {
      this.poseAt(this.prev!, now, leadMs, cfg);
      ox = this.pose.x;
      oz = this.pose.z;
      oyaw = this.pose.yaw;
    }
    const car = this.poseAt(base, now, leadMs, cfg);
    if (blend) {
      this.off.x += ox - this.pose.x;
      this.off.z += oz - this.pose.z;
      this.off.yaw += angleDiff(this.pose.yaw, oyaw);
    }
    this.needOffset = false;

    out.x = this.pose.x + this.off.x;
    out.z = this.pose.z + this.off.z;
    out.y = this.pose.y;
    out.yaw = this.pose.yaw + this.off.yaw;
    out.speed = Math.hypot(car.vx, car.vz);
    out.steer = car.steer;
    out.respawning = false;
    out.ghost = false;
    this.shown = true;
    return true;
  }
}
