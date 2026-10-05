import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOX_CAR, COCKPIT, PALETTE } from './look';

/** Shared by every car (built once). */
interface CarAssets {
  body: THREE.BufferGeometry;
  dash: THREE.BufferGeometry;
  dashMat: THREE.Material;
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

  // Cockpit pieces (seen from inside): a low dashboard and the windshield frame (two
  // pillars and a roof bar), merged into one mesh = one extra draw call for your car only.
  const cabinW = C.width * 0.86;
  const bodyTop = C.ride + C.bodyHeight;
  const t = COCKPIT.frameThickness;
  const dashBox = new THREE.BoxGeometry(cabinW, COCKPIT.dashHeight, COCKPIT.dashDepth);
  dashBox.translate(0, bodyTop + COCKPIT.dashHeight / 2, COCKPIT.dashForward - COCKPIT.dashDepth / 2);
  const pillar = (side: number): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(t, C.cabinHeight, t);
    g.translate(side * (cabinW / 2 - t / 2), bodyTop + C.cabinHeight / 2, COCKPIT.dashForward - t / 2);
    return g;
  };
  const roofBar = new THREE.BoxGeometry(cabinW, t, t);
  roofBar.translate(0, bodyTop + C.cabinHeight - t / 2, COCKPIT.dashForward - t / 2);
  const parts = [dashBox, pillar(1), pillar(-1), roofBar];
  const dash = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!dash) throw new Error('could not merge the cockpit');

  const shadow = new THREE.CircleGeometry(C.shadowRadius, 20);
  shadow.rotateX(-Math.PI / 2);

  assets = {
    body: merged,
    dash,
    dashMat: new THREE.MeshLambertMaterial({ color: COCKPIT.dashColor, flatShading: true }),
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
  /** Dashboard block, only for your own car while you sit in the cockpit cam. */
  private dash: THREE.Mesh | null = null;

  constructor(teamColor: number) {
    const a = getAssets();
    const C = BOX_CAR;
    this.bodyMat = new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });
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
    // Transparent only while ghosted, so normal cars stay in the cheaper opaque pass.
    if (this.bodyMat.transparent !== ghost) {
      this.bodyMat.transparent = ghost;
      this.bodyMat.opacity = ghost ? BOX_CAR.ghostOpacity : 1;
      this.bodyMat.needsUpdate = true;
    }
  }

  /** Show the inside (dashboard) when you look from this car's seat. */
  setCockpit(on: boolean): void {
    if (on && !this.dash) {
      const a = getAssets();
      this.dash = new THREE.Mesh(a.dash, a.dashMat);
      this.root.add(this.dash);
    } else if (!on && this.dash) {
      this.dash.removeFromParent();
      this.dash = null;
    }
    if (this.dash) this.dash.position.y = this.body.position.y;
  }

  dispose(): void {
    this.bodyMat.dispose();
    this.root.removeFromParent();
  }
}
