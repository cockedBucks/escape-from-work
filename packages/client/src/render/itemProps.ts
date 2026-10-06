import * as THREE from 'three';
import type { ItemBox } from '@escape/shared';
import type { CarSnap } from '../net/snapshots';
import { ITEM_LOOK } from './look';

/** One envelope or puddle as synced (`kind` 'mail' | 'coffee'). */
export interface ShotSnap {
  kind: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** What the item props draw this frame (kept by the caller; reused, not rebuilt per frame). */
export interface ItemsView {
  /** One char per box in track order: '1' = there. Empty = chaos off. */
  boxesUp: string;
  shots: readonly ShotSnap[];
  /** Client time (ms) the shots were last updated, to move envelopes in between. */
  shotsTime: number;
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** "?" on a yellow square: the Mystery Packet texture (drawn in code, no image files). */
function boxTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ITEM_LOOK.boxTextureSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not available');
  const n = canvas.width;
  ctx.fillStyle = ITEM_LOOK.boxColor;
  ctx.fillRect(0, 0, n, n);
  ctx.strokeStyle = ITEM_LOOK.boxEdge;
  ctx.lineWidth = n * 0.08;
  ctx.strokeRect(n * 0.04, n * 0.04, n * 0.92, n * 0.92);
  ctx.fillStyle = ITEM_LOOK.boxEdge;
  ctx.font = `700 ${n * 0.7}px Fredoka, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', n / 2, n * 0.54);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Item boxes, flying Reply-All envelopes, Coffee Spill puddles and Firewall bubbles. Each kind
 * is one InstancedMesh with a fixed pool (4 draw calls at most), updated in place every frame.
 */
export class ItemProps {
  readonly group = new THREE.Group();
  private readonly boxes: THREE.InstancedMesh;
  private readonly mail: THREE.InstancedMesh;
  private readonly coffee: THREE.InstancedMesh;
  private readonly shields: THREE.InstancedMesh;
  private readonly boxTex = boxTexture();

  constructor(private readonly boxSpots: readonly ItemBox[]) {
    const L = ITEM_LOOK;
    this.boxes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(L.boxSize, L.boxSize, L.boxSize),
      new THREE.MeshLambertMaterial({ map: this.boxTex }),
      Math.max(1, boxSpots.length),
    );
    const mailGeo = new THREE.BoxGeometry(L.mailWidth, L.mailHeight, L.mailLength);
    this.mail = new THREE.InstancedMesh(mailGeo, new THREE.MeshLambertMaterial({ color: L.mailColor }), L.maxShots);
    const puddleGeo = new THREE.CircleGeometry(1, L.puddleSegments);
    puddleGeo.rotateX(-Math.PI / 2);
    this.coffee = new THREE.InstancedMesh(puddleGeo, new THREE.MeshLambertMaterial({ color: L.coffeeColor }), L.maxShots);
    this.shields = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: L.shieldColor, transparent: true, opacity: L.shieldOpacity, depthWrite: false, flatShading: true }),
      L.maxShields,
    );
    for (const m of [this.boxes, this.mail, this.coffee, this.shields]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.boxes.castShadow = true;
  }

  /** Place everything for client time `now` (ms). */
  update(now: number, view: ItemsView | null, cars: ReadonlyMap<string, CarSnap>): void {
    const L = ITEM_LOOK;
    const t = now / 1000;
    // Boxes: spin and bob; broken ones are hidden.
    let nb = 0;
    if (view) {
      for (let i = 0; i < this.boxSpots.length && i < view.boxesUp.length; i++) {
        if (view.boxesUp[i] !== '1') continue;
        const b = this.boxSpots[i]!;
        Q.setFromAxisAngle(UP, t * L.boxSpin + i);
        P.set(b.x, L.boxHeight + Math.sin(t * L.boxBobRate + i) * L.boxBob, b.z);
        this.boxes.setMatrixAt(nb++, M.compose(P, Q, S.set(1, 1, 1)));
      }
    }
    this.boxes.count = nb;
    this.boxes.instanceMatrix.needsUpdate = true;

    // Envelopes fly on between patches; puddles sit flat on the road.
    let nm = 0;
    let nc = 0;
    if (view) {
      const ahead = Math.min(Math.max(now - view.shotsTime, 0), L.maxExtrapolateMs) / 1000;
      for (const s of view.shots) {
        if (s.kind === 'mail' && nm < L.maxShots) {
          Q.setFromAxisAngle(UP, Math.atan2(s.vx, s.vz));
          P.set(s.x + s.vx * ahead, L.mailFlyHeight, s.z + s.vz * ahead);
          this.mail.setMatrixAt(nm++, M.compose(P, Q, S.set(1, 1, 1)));
        } else if (s.kind === 'coffee' && nc < L.maxShots) {
          Q.identity();
          P.set(s.x, L.puddleLift, s.z);
          this.coffee.setMatrixAt(nc++, M.compose(P, Q, S.set(L.puddleRadius, 1, L.puddleRadius)));
        }
      }
    }
    this.mail.count = nm;
    this.mail.instanceMatrix.needsUpdate = true;
    this.coffee.count = nc;
    this.coffee.instanceMatrix.needsUpdate = true;

    // Firewall: a see-through bubble around every shielded car.
    let ns = 0;
    for (const car of cars.values()) {
      if (!car.shielded || ns >= L.maxShields) continue;
      Q.setFromAxisAngle(UP, t * L.shieldSpin);
      P.set(car.x, car.y + L.shieldHeight, car.z);
      this.shields.setMatrixAt(ns++, M.compose(P, Q, S.setScalar(L.shieldRadius)));
    }
    this.shields.count = ns;
    this.shields.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const m of [this.boxes, this.mail, this.coffee, this.shields]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    this.boxTex.dispose();
  }
}
