// The see-through car that drives your best lap (P11.1). One CarMesh in a single pale,
// see-through material (no shadow, no number), so it never looks like a real rival.
import * as THREE from 'three';
import type { CarLook } from '@escape/shared';
import { CarMesh, lookKeyOf } from './carMesh';
import { GHOST } from './look';
import type { GhostPose } from '../ghost/ghostLap';

export class LapGhostMesh {
  private mesh: CarMesh | null = null;
  private readonly material = new THREE.MeshLambertMaterial({
    color: GHOST.color,
    emissive: GHOST.glow,
    flatShading: true,
    transparent: true,
    opacity: GHOST.opacity,
    depthWrite: false,
  });

  constructor(private readonly scene: THREE.Scene) {}

  /** Draw the ghost at `pose` as car `look`, or hide it (null). */
  update(look: CarLook | null, pose: GhostPose | null, dt: number): void {
    if (look === null || pose === null) {
      if (this.mesh) this.mesh.root.visible = false;
      return;
    }
    if (this.mesh && this.mesh.lookKey !== lookKeyOf(look)) {
      this.mesh.dispose();
      this.mesh = null;
    }
    if (!this.mesh) {
      this.mesh = new CarMesh(look, GHOST.color, 0);
      this.mesh.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        // No blob shadow and no roof number: it is nobody's car.
        if (o.renderOrder < 0 || o.geometry instanceof THREE.PlaneGeometry) o.visible = false;
        o.material = this.material;
        o.castShadow = false;
      });
      this.scene.add(this.mesh.root);
    }
    this.mesh.root.visible = true;
    this.mesh.update(pose.x, pose.y, pose.z, pose.yaw, 0, 0, dt, false);
  }

  dispose(): void {
    this.mesh?.dispose();
    this.mesh = null;
    this.material.dispose();
  }
}
