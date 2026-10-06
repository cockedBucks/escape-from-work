import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Bobblehead, makeDuck } from './bobblehead';
import type { CockpitLift, SeatSide } from './cockpitCam';
import type { CarLook } from '@escape/shared';
import { buildCarShape, type CarShape } from './carKit';
import { headKick, Squash } from './juice';
import { BOX_CAR, CAR_KIT, COCKPIT, DUCK, HEAD, MIRROR, PALETTE, TEAM_COLORS } from './look';

/** A string that changes when a car's look does. */
const lookKeys = new WeakMap<CarLook, string>();

/** A key that changes when the car must be rebuilt; cached per look object (asked every frame). */
export function lookKeyOf(look: CarLook): string {
  let key = lookKeys.get(look);
  if (key === undefined) {
    key = `${look.body}|${look.wheelScale}|${look.parts.join(',')}`;
    lookKeys.set(look, key);
  }
  return key;
}

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

/** Wheel geometry by radius (shared by every car with that wheel size). */
const wheelCache = new Map<number, THREE.BufferGeometry>();
/** Both rear wheels on one axle, by radius and track. */
const axleCache = new Map<string, THREE.BufferGeometry>();

function wheelGeo(radius: number): THREE.BufferGeometry {
  let g = wheelCache.get(radius);
  if (!g) {
    g = new THREE.CylinderGeometry(radius, radius, CAR_KIT.wheelWidth, CAR_KIT.wheelSegments);
    g.rotateZ(Math.PI / 2); // axle along X
    wheelCache.set(radius, g);
  }
  return g;
}

function axleGeo(radius: number, track: number): THREE.BufferGeometry {
  const key = `${radius}:${track}`;
  let g = axleCache.get(key);
  if (!g) {
    const l = wheelGeo(radius).clone().translate(track, 0, 0);
    const r = wheelGeo(radius).clone().translate(-track, 0, 0);
    const merged = mergeGeometries([l, r]);
    l.dispose();
    r.dispose();
    if (!merged) throw new Error('could not merge the rear wheels');
    g = merged;
    axleCache.set(key, g);
  }
  return g;
}

/** Roof numbers 1–8 in one canvas atlas (white on a dark disc), shared by every car. */
let numberAtlas: THREE.MeshBasicMaterial | null = null;
function numberMaterial(): THREE.MeshBasicMaterial {
  if (numberAtlas) return numberAtlas;
  const px = CAR_KIT.numberPx;
  const count = TEAM_COLORS.length;
  const canvas = document.createElement('canvas');
  canvas.width = px * count;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not available');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${px * 0.62}px Fredoka, system-ui, sans-serif`;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = `#${PALETTE.uiDark.toString(16).padStart(6, '0')}`;
    ctx.beginPath();
    ctx.arc(px * i + px / 2, px / 2, px * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(i + 1), px * i + px / 2, px * 0.54);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  numberAtlas = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  return numberAtlas;
}

/** A flat square on the car showing team number `n` (1-based) from the atlas. */
function numberGeo(n: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(CAR_KIT.numberSize, CAR_KIT.numberSize);
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI); // readable from behind (the chase cam)
  const count = TEAM_COLORS.length;
  const u0 = ((((n - 1) % count) + count) % count) / count;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) / count);
  uv.needsUpdate = true;
  return g;
}

/**
 * A car built by the car kit (ART_STYLE §4) from its look: one vertex-colored body in team
 * paint, two steering front wheels, a rear axle, a roof number and a blob shadow (6 draw
 * calls, < 1,500 triangles), plus the two seats: bobbleheads (1 draw call each) or a duck.
 */
export class CarMesh {
  readonly root = new THREE.Group();
  /** What it was built from (the game rebuilds the car when a team picks another). */
  readonly lookKey: string;
  private readonly shape: CarShape;
  private readonly bodyMat: THREE.MeshLambertMaterial;
  private readonly body: THREE.Mesh;
  private readonly number: THREE.Mesh;
  private readonly shadowGeo: THREE.BufferGeometry;
  private readonly wheels: THREE.Mesh[] = [];
  private readonly frontWheels: THREE.Mesh[] = [];
  private spin = 0;
  private readonly squash = new Squash();
  /** Your eye in this car (your own head's place) vs the box car's eye; the dash moves with it. */
  readonly cockpitLift: CockpitLift;
  /** Dashboard block, only for your own car while you sit in the cockpit cam. */
  private dash: THREE.Mesh | null = null;
  /** What sits in the left and right seat. */
  private readonly seats: Record<SeatSide, { kind: 'head'; head: Bobblehead } | { kind: 'duck'; mesh: THREE.Mesh } | null> = {
    left: null,
    right: null,
  };

  /** `look` from cars.json, team paint, and the team number shown on the roof (1-based). */
  constructor(look: CarLook, teamColor: number, teamNumber: number) {
    const a = getAssets();
    this.lookKey = lookKeyOf(look);
    this.shape = buildCarShape(look, teamColor);
    const s = this.shape;
    this.cockpitLift = {
      y: s.headY + COCKPIT.eyeAboveHead - (BOX_CAR.ride + BOX_CAR.bodyHeight + COCKPIT.eyeAboveBody),
      z: s.seatZ + COCKPIT.seatBack,
    };
    this.bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.body = new THREE.Mesh(s.body, this.bodyMat);
    this.body.castShadow = true;
    this.root.add(this.body);
    this.number = new THREE.Mesh(numberGeo(teamNumber), numberMaterial());
    this.number.position.set(0, s.numberY, s.numberZ);
    this.body.add(this.number);
    for (const sx of [1, -1]) {
      const w = new THREE.Mesh(wheelGeo(s.wheelRadius), a.wheelMat);
      w.position.set(sx * s.wheelTrack, s.wheelRadius, s.wheelBase);
      w.rotation.order = 'YXZ';
      this.root.add(w);
      this.wheels.push(w);
      this.frontWheels.push(w);
    }
    const rear = new THREE.Mesh(axleGeo(s.wheelRadius, s.wheelTrack), a.wheelMat);
    rear.position.set(0, s.wheelRadius, -s.wheelBase);
    this.root.add(rear);
    this.wheels.push(rear);
    this.shadowGeo = new THREE.CircleGeometry(Math.max(s.length, s.width) * CAR_KIT.shadowShare, 20);
    this.shadowGeo.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(this.shadowGeo, a.shadowMat);
    shadow.position.y = 0.03;
    shadow.renderOrder = -1;
    this.root.add(shadow);
  }

  /**
   * Place the car. `y` is jump height; the blob shadow stays on the ground.
   * Wheels spin by distance driven (`speed × dt`) and front wheels turn with `steer`.
   */
  update(x: number, y: number, z: number, yaw: number, speed: number, steer: number, dt: number, ghost: boolean): void {
    const r = this.shape.wheelRadius;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
    this.body.position.y = y;
    // Landing squash and stretch (the body is built standing on y = 0, so it squashes onto its wheels).
    this.squash.step(dt);
    this.body.scale.set(this.squash.scaleXZ, this.squash.scaleY, this.squash.scaleXZ);
    this.spin += (speed * dt) / r;
    for (const w of this.wheels) {
      w.rotation.x = this.spin;
      w.position.y = r + y;
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
      seat.head.mesh.position.set(x, this.shape.headY + y, this.shape.seatZ);
      seat.head.mesh.visible = !content.hidden;
      seat.head.update(content.yaw, content.pitch, forwardAccel, sideAccel, dt);
    } else if (seat.kind === 'duck') {
      // The duck sits where a head would, a little lower (it is smaller).
      seat.mesh.position.set(x, this.shape.headY - (HEAD.centerY - DUCK.y) + y, this.shape.seatZ);
    }
  }

  /** A hit or landing at `impact` m/s: heads bob; a landing also squashes the body. */
  jolt(impact: number, landing: boolean): void {
    if (landing) this.squash.land(impact);
    for (const seat of [this.seats.left, this.seats.right]) {
      if (seat?.kind === 'head') seat.head.kick(headKick(impact));
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
    if (this.dash) this.dash.position.set(0, this.body.position.y + this.cockpitLift.y, this.cockpitLift.z);
  }

  dispose(): void {
    this.bodyMat.dispose();
    this.shape.body.dispose();
    this.number.geometry.dispose();
    this.shadowGeo.dispose();
    this.root.removeFromParent();
  }
}
