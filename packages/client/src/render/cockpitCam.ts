import * as THREE from 'three';
import { clamp, type Tuning } from '@escape/shared';
import { followAlpha } from './cameras';
import { BOX_CAR, COCKPIT } from './look';

/** Where a car's cockpit eye sits relative to the box car's: up (y) and forward (z), meters. */
export interface CockpitLift {
  y: number;
  z: number;
}
export const NO_LIFT: CockpitLift = { y: 0, z: 0 };

export type SeatSide = 'left' | 'right';

/** Pilot (and solo) sit on the left, the Engineer on the right (ART_STYLE §4). */
export const seatSideFor = (seat: string): SeatSide => (seat === 'engineer' ? 'right' : 'left');

/**
 * First-person camera in your seat. Head yaw/pitch come from the mouse (Pointer Lock) and
 * are limited; when the mouse is free the head drifts back to looking ahead. Bumps (wall
 * hits, landings, car hits) kick a small spring that bobs the head.
 */
export class CockpitCam {
  /** Head angles relative to the car (rad): + yaw = look left, + pitch = look up. */
  headYaw = 0;
  headPitch = 0;
  private bob = 0;
  private bobVel = 0;
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** Mouse moved by (dx, dy) pixels while the pointer is locked. */
  mouse(dx: number, dy: number, cfg: Tuning['camera']): void {
    this.headYaw = clamp(this.headYaw - dx * cfg.mouseSensitivity, -cfg.headYawLimit, cfg.headYawLimit);
    this.headPitch = clamp(this.headPitch - dy * cfg.mouseSensitivity, -cfg.headPitchLimit, cfg.headPitchLimit);
  }

  /** A bump of `strength` (m/s of impact) shakes the head. */
  bump(strength: number, cfg: Tuning['camera']): void {
    this.bobVel -= strength * cfg.headBob;
  }

  /** `lift`: how far this car's eye sits above / ahead of the box car's (`CarMesh.cockpitLift`). */
  update(cfg: Tuning['camera'], x: number, y: number, z: number, yaw: number, side: SeatSide, dt: number, mouseLocked: boolean, lift: CockpitLift = NO_LIFT): void {
    if (!mouseLocked) {
      // Mouse free: the head eases back to looking straight ahead.
      const a = followAlpha(cfg.headRecenterRate, dt);
      this.headYaw -= this.headYaw * a;
      this.headPitch -= this.headPitch * a;
    }
    // Damped spring for the bob (critically damped-ish at this stiffness).
    const k = cfg.headBobStiffness;
    this.bobVel += (-k * k * this.bob - 2 * k * this.bobVel) * dt;
    this.bob += this.bobVel * dt;

    // Seat position in car space: +X is the car's left (yaw 0 faces +Z, right is -X).
    const lateral = side === 'left' ? COCKPIT.seatOffset : -COCKPIT.seatOffset;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const lx = Math.cos(yaw); // car's left = (cos yaw, -sin yaw)
    const lz = -Math.sin(yaw);
    const back = COCKPIT.seatBack - lift.z;
    this.eye.set(
      x + lx * lateral - fx * back,
      y + BOX_CAR.ride + BOX_CAR.bodyHeight + COCKPIT.eyeAboveBody + lift.y + this.bob,
      z + lz * lateral - fz * back,
    );
    const lookYaw = yaw + this.headYaw;
    const cp = Math.cos(this.headPitch);
    this.look.set(
      this.eye.x + Math.sin(lookYaw) * cp,
      this.eye.y + Math.sin(this.headPitch),
      this.eye.z + Math.cos(lookYaw) * cp,
    );
    if (this.camera.fov !== cfg.cockpitFov) {
      this.camera.fov = cfg.cockpitFov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.look);
  }
}
