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

/** Stats do not change how far ahead we predict; the server's car stats are close enough. */
const PREDICT_STATS = { speed: 1, grip: 1, weight: 1 };

/**
 * Client-side prediction for YOUR car only (FUN GATE: steering felt a bit laggy).
 *
 * Every server update gives a fresh starting point. Each frame we run the shared physics
 * from there, ahead by (time since that update + input echo time), with your own keys for
 * the controls your role owns and the server's last input for your partner's. The car
 * therefore answers your keys at once, the server stays in charge, and when the server
 * disagrees the difference fades out (`net.predictCorrectionRate`) instead of snapping.
 * Other cars stay interpolated. Car-vs-car bumps are not predicted.
 */
export class OwnCarPredictor {
  private id = '';
  private world: World | null = null;
  private base: CarState | null = null;
  private baseArrival = 0;
  private serverInput: CarInput = { ...NO_INPUT };
  private shown: { x: number; z: number; yaw: number } | null = null;
  private off = { x: 0, z: 0, yaw: 0 };
  private needOffset = false;
  private lastNow = -1;

  constructor(private readonly track: Track) {}

  /** A server update for your car arrived at client time `arrival`. */
  onServer(id: string, view: OwnCarView, arrival: number): void {
    if (id !== this.id) {
      this.id = id;
      this.world = createWorld(this.track, [createCar(id, PREDICT_STATS, this.track)]);
      this.shown = null;
      this.off = { x: 0, z: 0, yaw: 0 };
    }
    const car = createCar(id, PREDICT_STATS, this.track);
    car.x = view.x;
    car.z = view.z;
    car.y = view.y;
    car.vy = view.vy;
    car.yaw = view.yaw;
    car.vx = view.vx;
    car.vz = view.vz;
    car.steer = view.steer;
    car.respawnAtTick = view.respawning ? 1 : -1;
    const loc = locateOnTrack(this.track, { x: view.x, z: view.z }, this.base?.segment);
    car.segment = loc.segment;
    car.progress = lapProgress(this.track, loc.progress);
    car.lateral = loc.lateral;
    this.base = car;
    this.baseArrival = arrival;
    this.serverInput = { steer: view.inSteer, gas: view.inGas, brake: view.inBrake, respawn: false };
    this.needOffset = this.shown !== null;
  }

  /**
   * Fill `out` with your car's predicted pose at client time `now`. Returns false when
   * prediction is off or not possible (then draw the interpolated car instead).
   */
  predict(now: number, local: CarInput, role: Role | null, leadMs: number, cfg: Tuning, out: CarSnap): boolean {
    const world = this.world;
    const base = this.base;
    if (!world || !base || role === null || cfg.net.predictMaxMs <= 0 || base.respawnAtTick >= 0) {
      this.shown = null;
      return false;
    }
    const input: CarInput = {
      steer: mayUse(role, 'steer') ? local.steer : this.serverInput.steer,
      gas: mayUse(role, 'gas') ? local.gas : this.serverInput.gas,
      brake: mayUse(role, 'brake') ? local.brake : this.serverInput.brake,
      respawn: false,
    };
    const dtMs = cfg.sim.dt * 1000;
    const aheadMs = Math.min(Math.max(now - this.baseArrival + leadMs, 0), cfg.net.predictMaxMs);
    const ticks = aheadMs / dtMs;
    const whole = Math.floor(ticks);
    const frac = ticks - whole;

    const car = world.cars[0] as CarState;
    Object.assign(car, base);
    world.tick = 0;
    const inputs = { [this.id]: input };
    for (let i = 0; i < whole; i++) step(world, inputs, cfg);
    const ax = car.x;
    const az = car.z;
    const ay = car.y;
    const ayaw = car.yaw;
    step(world, inputs, cfg);
    // Blend between whole ticks so the car moves smoothly at any frame rate.
    const x = ax + (car.x - ax) * frac;
    const z = az + (car.z - az) * frac;
    const yaw = ayaw + angleDiff(ayaw, car.yaw) * frac;

    // A fresh server state moved the prediction: start from where the car was drawn and
    // let the difference fade, so corrections never look like a jump.
    if (this.needOffset && this.shown) {
      this.off = { x: this.shown.x - x, z: this.shown.z - z, yaw: angleDiff(yaw, this.shown.yaw) };
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
    this.shown = { x: out.x, z: out.z, yaw: out.yaw };
    return true;
  }
}
