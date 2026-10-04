import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOX_CAR, PALETTE } from './look';

/** Shared by every car (built once). */
interface CarAssets {
  body: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  shadow: THREE.BufferGeometry;
  wheelMat: THREE.Material;
  shadowMat: THREE.Material;
}

let assets: CarAssets | null = null;

function getAssets(): CarAssets {
  if (assets) return assets;
  const C = BOX_CAR;
  const body = new THREE.BoxGeometry(C.width, C.bodyHeight, C.length);
  body.translate(0, C.ride + C.bodyHeight / 2, 0);
  const cabin = new THREE.BoxGeometry(C.width * 0.86, C.cabinHeight, C.cabinLength);
  cabin.translate(0, C.ride + C.bodyHeight + C.cabinHeight / 2, -C.cabinBack);
  const merged = mergeGeometries([body, cabin]);
  body.dispose();
  cabin.dispose();
  if (!merged) throw new Error('could not merge the box car body');

  const wheel = new THREE.CylinderGeometry(C.wheelRadius, C.wheelRadius, C.wheelWidth, 14);
  wheel.rotateZ(Math.PI / 2); // axle along X

  const shadow = new THREE.CircleGeometry(C.shadowRadius, 20);
  shadow.rotateX(-Math.PI / 2);

  assets = {
    body: merged,
    wheel,
    shadow,
    wheelMat: new THREE.MeshLambertMaterial({ color: PALETTE.tire, flatShading: true }),
    shadowMat: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: C.shadowOpacity, depthWrite: false }),
  };
  return assets;
}

/**
 * Placeholder box car (P7 replaces it with the car kit): one merged body in team color,
 * four wheels that spin and steer, a blob shadow. 6 draw calls, about 300 triangles.
 */
export class BoxCar {
  readonly root = new THREE.Group();
  private readonly bodyMat: THREE.MeshLambertMaterial;
  private readonly body: THREE.Mesh;
  private readonly wheels: THREE.Mesh[] = [];
  private readonly frontWheels: THREE.Mesh[] = [];
  private spin = 0;

  constructor(teamColor: number) {
    const a = getAssets();
    const C = BOX_CAR;
    this.bodyMat = new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true, transparent: true });
    this.body = new THREE.Mesh(a.body, this.bodyMat);
    this.body.castShadow = true;
    this.root.add(this.body);
    for (const [fz, sx] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const w = new THREE.Mesh(a.wheel, a.wheelMat);
      w.position.set(sx * C.wheelTrack, C.wheelRadius, fz * C.wheelBase);
      w.rotation.order = 'YXZ';
      this.root.add(w);
      this.wheels.push(w);
      if (fz === 1) this.frontWheels.push(w);
    }
    const shadow = new THREE.Mesh(a.shadow, a.shadowMat);
    shadow.position.y = 0.03;
    shadow.renderOrder = -1;
    this.root.add(shadow);
  }

  /**
   * Place the car. `y` is jump height; the blob shadow stays on the ground.
   * Wheels spin by distance driven (`speed × dt`) and front wheels turn with `steer`.
   */
  update(x: number, y: number, z: number, yaw: number, speed: number, steer: number, dt: number, ghost: boolean): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
    this.body.position.y = y;
    this.spin += (speed * dt) / BOX_CAR.wheelRadius;
    for (const w of this.wheels) {
      w.rotation.x = this.spin;
      w.position.y = BOX_CAR.wheelRadius + y;
    }
    // Steer +1 = right = yaw goes down.
    for (const w of this.frontWheels) w.rotation.y = -steer * BOX_CAR.maxWheelTurn;
    this.bodyMat.opacity = ghost ? BOX_CAR.ghostOpacity : 1;
  }

  dispose(): void {
    this.bodyMat.dispose();
    this.root.removeFromParent();
  }
}
