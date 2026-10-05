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
  /** Merged input the server applied (your partner's half comes from here). */
  inSteer: number;
  inGas: boolean;
  inBrake: boolean;
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
export class OwnCarPredictor {
  private id = '';
  private world: World | null = null;
  private base: CarState | null = null;
  private baseTime = 0;
  private readonly serverInput: CarInput = { ...NO_INPUT };
  private readonly input: CarInput = { ...NO_INPUT };
  private inputs: Record<string, CarInput> = {};
  private readonly shown = { valid: false, x: 0, z: 0, yaw: 0 };
  private readonly off = { x: 0, z: 0, yaw: 0 };
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
      this.shown.valid = false;
      this.off.x = this.off.z = this.off.yaw = 0;
    }
    const prev = this.base;
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
    const loc = locateOnTrack(this.track, { x: view.x, z: view.z }, near ? prev.segment : undefined);
    car.segment = loc.segment;
    car.progress = lapProgress(this.track, loc.progress);
    car.lateral = loc.lateral;
    this.base = car;
    this.baseTime = time;
    this.serverInput.steer = view.inSteer;
    this.serverInput.gas = view.inGas;
    this.serverInput.brake = view.inBrake;
    this.needOffset = this.shown.valid;
  }

  /**
   * Fill `out` with your car's predicted pose at client time `now`. Returns false when
   * prediction is off or not possible (then draw the interpolated car instead).
   */
  predict(now: number, local: CarInput, role: Role | null, leadMs: number, cfg: Tuning, out: CarSnap): boolean {
    const world = this.world;
    const base = this.base;
    if (!world || !base || role === null || cfg.net.predictMaxMs <= 0 || base.respawnAtTick >= 0) {
      this.shown.valid = false;
      return false;
    }
    const input = this.input;
    input.steer = mayUse(role, 'steer') ? local.steer : this.serverInput.steer;
    input.gas = mayUse(role, 'gas') ? local.gas : this.serverInput.gas;
    input.brake = mayUse(role, 'brake') ? local.brake : this.serverInput.brake;
    input.respawn = false;

    const dtMs = cfg.sim.dt * 1000;
    const aheadMs = Math.min(Math.max(now - this.baseTime + leadMs, 0), cfg.net.predictMaxMs);
    const ticks = aheadMs / dtMs;
    const whole = Math.floor(ticks);
    const frac = ticks - whole;

    const car = world.cars[0] as CarState;
    Object.assign(car, base);
    world.tick = 0;
    for (let i = 0; i < whole; i++) step(world, this.inputs, cfg);
    const ax = car.x;
    const az = car.z;
    const ay = car.y;
    const ayaw = car.yaw;
    step(world, this.inputs, cfg);
    // Blend between whole ticks so the car moves smoothly at any frame rate.
    const x = ax + (car.x - ax) * frac;
    const z = az + (car.z - az) * frac;
    const yaw = ayaw + angleDiff(ayaw, car.yaw) * frac;

    // A fresh server state moved the prediction: start from where the car was drawn and
    // let the difference fade, so corrections never look like a jump.
    if (this.needOffset && this.shown.valid) {
      this.off.x = this.shown.x - x;
      this.off.z = this.shown.z - z;
      this.off.yaw = angleDiff(yaw, this.shown.yaw);
    }
    this.needOffset = false;
    const frameDt = this.lastNow < 0 ? 0 : Math.max(now - this.lastNow, 0) / 1000;
    this.lastNow = now;
    const keep = Math.exp(-cfg.net.predictCorrectionRate * frameDt);
    this.off.x *= keep;
    this.off.z *= keep;
    this.off.yaw *= keep;

    out.x = x + this.off.x;
    out.z = z + this.off.z;
    out.y = ay + (car.y - ay) * frac;
    out.yaw = yaw + this.off.yaw;
    out.speed = Math.hypot(car.vx, car.vz);
    out.steer = car.steer;
    out.respawning = false;
    out.ghost = false;
    this.shown.valid = true;
    this.shown.x = out.x;
    this.shown.z = out.z;
    this.shown.yaw = out.yaw;
    return true;
  }
}
