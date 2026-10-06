import * as THREE from 'three';
import type { Tuning } from '@escape/shared';
import { OVERVIEW } from './look';

/** Smallest field-of-view change (degrees) worth rebuilding the projection for. */
const FOV_EPSILON = 0.05;

/** Extra chase-cam field of view (degrees) at `speedShare` × top speed (more past top speed). */
export function speedFovBoost(cfg: Tuning['camera'], speedShare: number): number {
  const t = (speedShare - cfg.speedFovFrom) / (1 - cfg.speedFovFrom);
  return cfg.speedFov * Math.min(Math.max(t, 0), 1.5);
}

/** Frame-rate independent smoothing factor for "catch up at `rate` per second". */
export const followAlpha = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/**
 * Chase cam: sits behind and above the car and eases toward that spot, so turns and bumps
 * feel smooth instead of rigid. Reuses its vectors (no per-frame allocation).
 */
export class ChaseCam {
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly wantPos = new THREE.Vector3();
  private readonly wantLook = new THREE.Vector3();
  private placed = false;
  private fov = -1;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /**
   * Follow a car at (x, y, z) facing `yaw`. `snap` jumps straight there (first frame,
   * scenarios). `speedShare` = speed ÷ top speed: the view widens as the car goes faster.
   */
  update(cfg: Tuning['camera'], x: number, y: number, z: number, yaw: number, dt: number, snap = false, speedShare = 0): void {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    this.wantPos.set(x - fx * cfg.chaseDistance, y + cfg.chaseHeight, z - fz * cfg.chaseDistance);
    this.wantLook.set(x + fx * cfg.lookAhead, y + cfg.lookHeight, z + fz * cfg.lookAhead);
    if (snap || !this.placed) {
      this.pos.copy(this.wantPos);
      this.look.copy(this.wantLook);
      this.placed = true;
    } else {
      const a = followAlpha(cfg.followRate, dt);
      this.pos.lerp(this.wantPos, a);
      this.look.lerp(this.wantLook, a);
    }
    const want = cfg.fov + speedFovBoost(cfg, speedShare);
    this.fov = snap || this.fov < 0 ? want : this.fov + (want - this.fov) * followAlpha(cfg.followRate, dt);
    if (Math.abs(this.camera.fov - this.fov) > FOV_EPSILON) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}

/** Top-down camera that fits the whole track box. */
export function placeOverview(camera: THREE.PerspectiveCamera, bounds: THREE.Box3): void {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  camera.fov = OVERVIEW.fov;
  camera.updateProjectionMatrix();
  // Height at which the vertical view covers Z and the horizontal view covers X.
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const height = Math.max(size.z / 2 / tanHalf, size.x / 2 / (tanHalf * camera.aspect)) * OVERVIEW.margin;
  // A hair of Z offset so lookAt straight down has a defined "up".
  camera.position.set(center.x, height, center.z + 1e-3);
  // Tight near/far around the ground keeps depth precise from this high up.
  camera.near = height * OVERVIEW.nearFraction;
  camera.far = height * OVERVIEW.farFraction;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
}
