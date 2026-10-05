import * as THREE from 'three';
import type { QualityPreset } from '@escape/shared';
import { BOX_CAR, COCKPIT, MIRROR } from './look';

/** Should the mirror re-render on this frame? Off on Low, every 2nd frame on Medium, every frame on High. */
export function mirrorDue(mode: QualityPreset['mirror'], frame: number): boolean {
  if (mode === 'off') return false;
  return mode === 'full' || frame % 2 === 0;
}

/**
 * Rear-view mirror for the cockpit cam: a small backward-looking camera renders into a
 * low-res texture shown on a panel at the top of your windshield (flipped like a mirror).
 */
export class RearMirror {
  readonly mesh: THREE.Mesh;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly camera: THREE.PerspectiveCamera;
  private frame = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly mode: QualityPreset['mirror']) {
    this.target = new THREE.WebGLRenderTarget(MIRROR.pixelsWide, Math.round(MIRROR.pixelsWide * MIRROR.aspectHeight));
    this.camera = new THREE.PerspectiveCamera(MIRROR.fov, 1 / MIRROR.aspectHeight, 0.3, MIRROR.far);
    const map = this.target.texture;
    map.colorSpace = THREE.SRGBColorSpace;
    // Flip left-right: a mirror shows the car behind-left on your left.
    map.wrapS = THREE.RepeatWrapping;
    map.repeat.x = -1;
    map.offset.x = 1;
    const geo = new THREE.PlaneGeometry(MIRROR.width, MIRROR.width * MIRROR.aspectHeight);
    geo.rotateY(Math.PI); // face the driver (who looks toward +Z)
    const top = BOX_CAR.ride + BOX_CAR.bodyHeight + BOX_CAR.cabinHeight;
    geo.translate(MIRROR.offsetX, top - MIRROR.below, COCKPIT.dashForward - COCKPIT.frameThickness * 1.5);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  }

  /** Render the view behind the car (x, y, z, yaw = your car) when this frame is due. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, x: number, y: number, z: number, yaw: number): void {
    this.frame++;
    if (!mirrorDue(this.mode, this.frame)) return;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const eyeY = y + BOX_CAR.ride + BOX_CAR.bodyHeight + BOX_CAR.cabinHeight + MIRROR.cameraAbove;
    this.camera.position.set(x - fx * MIRROR.cameraBack, eyeY, z - fz * MIRROR.cameraBack);
    this.camera.lookAt(this.tmp.set(x - fx * MIRROR.far, eyeY, z - fz * MIRROR.far));
    this.mesh.visible = false; // never show the mirror in itself
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    // The main pass updates the shadow map; drawing it twice a frame would double that cost.
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.render(scene, this.camera);
    renderer.shadowMap.autoUpdate = shadows;
    renderer.setRenderTarget(before);
    this.mesh.visible = true;
  }

  dispose(): void {
    this.target.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
