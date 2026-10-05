import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Bobblehead, makeDuck } from './bobblehead';
import type { SeatSide } from './cockpitCam';
import { BOX_CAR, COCKPIT, DUCK, HEAD, MIRROR, PALETTE } from './look';

/** What a seat shows: a player's bobblehead (hidden = it is you, in the cockpit), a duck, or nobody. */
export type SeatContent =
  | { kind: 'head'; material: THREE.Material; yaw: number; pitch: number; hidden: boolean }
  | { kind: 'duck' }
  | null;

/** Shared by every car (built once). */
interface CarAssets {
  body: THREE.BufferGeometry;
  /** Both rear wheels in one mesh: they share an axle, so they spin together (one draw call). */
  rearAxle: THREE.BufferGeometry;
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
  // Rear-view mirror housing: a dark frame just behind the mirror picture (see mirror.ts).
  const mirrorFrame = new THREE.BoxGeometry(MIRROR.width + MIRROR.frame * 2, MIRROR.width * MIRROR.aspectHeight + MIRROR.frame * 2, t / 2);
  mirrorFrame.translate(MIRROR.offsetX, bodyTop + C.cabinHeight - MIRROR.below, COCKPIT.dashForward - t * 1.5 + t / 3);
  const parts = [dashBox, pillar(1), pillar(-1), roofBar, mirrorFrame];
  const dash = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!dash) throw new Error('could not merge the cockpit');

  const rearL = wheel.clone().translate(C.wheelTrack, 0, 0);
  const rearR = wheel.clone().translate(-C.wheelTrack, 0, 0);
  const rearAxle = mergeGeometries([rearL, rearR]);
  rearL.dispose();
  rearR.dispose();
  if (!rearAxle) throw new Error('could not merge the rear wheels');

  const shadow = new THREE.CircleGeometry(C.shadowRadius, 20);
  shadow.rotateX(-Math.PI / 2);

  assets = {
    body: merged,
    rearAxle,
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
 * two steering front wheels, one rear axle, a blob shadow (5 draw calls, ~300 triangles),
 * plus what sits in the two seats: bobbleheads (1 draw call each) or a rubber duck.
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
  /** What sits in the left and right seat. */
  private readonly seats: Record<SeatSide, { kind: 'head'; head: Bobblehead } | { kind: 'duck'; mesh: THREE.Mesh } | null> = {
    left: null,
    right: null,
  };

  constructor(teamColor: number) {
    const a = getAssets();
    const C = BOX_CAR;
    this.bodyMat = new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });
    this.body = new THREE.Mesh(a.body, this.bodyMat);
    this.body.castShadow = true;
    this.root.add(this.body);
    for (const sx of [1, -1]) {
      const w = new THREE.Mesh(a.wheel, a.wheelMat);
      w.position.set(sx * C.wheelTrack, C.wheelRadius, C.wheelBase);
      w.rotation.order = 'YXZ';
      this.root.add(w);
      this.wheels.push(w);
      this.frontWheels.push(w);
    }
    const rear = new THREE.Mesh(a.rearAxle, a.wheelMat);
    rear.position.set(0, C.wheelRadius, -C.wheelBase);
    this.root.add(rear);
    this.wheels.push(rear);
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

  /**
   * Put a bobblehead (or the duck, or nobody) in a seat and move it for this frame.
   * `forwardAccel`/`sideAccel` (m/s²) drive the wobble; `y` is the car's jump height.
   */
  setSeat(side: SeatSide, content: SeatContent, y: number, forwardAccel: number, sideAccel: number, dt: number): void {
    const x = side === 'left' ? COCKPIT.seatOffset : -COCKPIT.seatOffset;
    let seat = this.seats[side];
    const want = content?.kind ?? null;
    if ((seat?.kind ?? null) !== want) {
      if (seat) (seat.kind === 'head' ? seat.head.mesh : seat.mesh).removeFromParent();
      seat = null;
      if (content?.kind === 'head') seat = { kind: 'head', head: new Bobblehead(content.material) };
      else if (content?.kind === 'duck') seat = { kind: 'duck', mesh: makeDuck() };
      if (seat) this.root.add(seat.kind === 'head' ? seat.head.mesh : seat.mesh);
      this.seats[side] = seat;
    }
    if (!seat || !content) return;
    if (seat.kind === 'head' && content.kind === 'head') {
      seat.head.setMaterial(content.material);
      seat.head.mesh.position.set(x, HEAD.centerY + y, -COCKPIT.seatBack);
      seat.head.mesh.visible = !content.hidden;
      seat.head.update(content.yaw, content.pitch, forwardAccel, sideAccel, dt);
    } else if (seat.kind === 'duck') {
      seat.mesh.position.set(x, DUCK.y + y, -COCKPIT.seatBack);
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
