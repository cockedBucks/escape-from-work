import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from '@escape/shared';
import { DUCK, HEAD } from './look';

let headGeo: THREE.SphereGeometry | null = null;
const sphere = (): THREE.SphereGeometry => (headGeo ??= new THREE.SphereGeometry(HEAD.radius, 20, 14));

/**
 * The wobble: a damped spring per axis, pushed by the car's acceleration. Braking tips the
 * head forward, gas tips it back, turning swings it to the outside.
 */
export class Wobble {
  pitch = 0;
  roll = 0;
  private vp = 0;
  private vr = 0;

  step(forwardAccel: number, sideAccel: number, dt: number): void {
    const k = HEAD.wobbleStiffness;
    const damp = HEAD.wobbleDamping;
    const tp = clamp(forwardAccel * HEAD.wobblePerAccel, -HEAD.wobbleMax, HEAD.wobbleMax);
    const tr = clamp(sideAccel * HEAD.wobblePerAccel, -HEAD.wobbleMax, HEAD.wobbleMax);
    this.vp += (k * k * (tp - this.pitch) - 2 * damp * k * this.vp) * dt;
    this.vr += (k * k * (tr - this.roll) - 2 * damp * k * this.vr) * dt;
    this.pitch += this.vp * dt;
    this.roll += this.vr * dt;
  }
}

/** A big wobbly head with a face, turning where its player looks. One draw call. */
export class Bobblehead {
  readonly mesh: THREE.Mesh;
  private readonly wobble = new Wobble();

  constructor(material: THREE.Material) {
    this.mesh = new THREE.Mesh(sphere(), material);
    this.mesh.rotation.order = 'YXZ';
  }

  setMaterial(material: THREE.Material): void {
    this.mesh.material = material;
  }

  /** `headYaw` + = looking left, `headPitch` + = looking up (same as the cockpit cam). */
  update(headYaw: number, headPitch: number, forwardAccel: number, sideAccel: number, dt: number): void {
    this.wobble.step(forwardAccel, sideAccel, dt);
    this.mesh.rotation.y = headYaw;
    this.mesh.rotation.x = -headPitch - this.wobble.pitch;
    this.mesh.rotation.z = this.wobble.roll;
  }
}

let duckGeo: THREE.BufferGeometry | null = null;
let duckMat: THREE.Material | null = null;

/** The rubber duck in the empty seat of a solo car. One draw call (vertex colors). */
export function makeDuck(): THREE.Mesh {
  if (!duckGeo || !duckMat) {
    const colored = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
      const c = new THREE.Color(hex);
      const n = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]!), 3));
      return g;
    };
    const body = colored(new THREE.SphereGeometry(DUCK.bodyRadius, 12, 8), DUCK.yellow);
    body.scale(1, 0.8, 1.2);
    const head = colored(new THREE.SphereGeometry(DUCK.headRadius, 12, 8), DUCK.yellow);
    head.translate(0, DUCK.bodyRadius * 0.95, DUCK.bodyRadius * 0.45);
    const beak = colored(new THREE.ConeGeometry(DUCK.headRadius * 0.45, DUCK.headRadius * 0.8, 8), DUCK.orange);
    beak.rotateX(Math.PI / 2);
    beak.translate(0, DUCK.bodyRadius * 0.9, DUCK.bodyRadius * 0.45 + DUCK.headRadius * 1.1);
    const parts = [body, head, beak];
    // Merging needs the same attributes everywhere: keep only position, normal and color.
    for (const p of parts) {
      p.deleteAttribute('uv');
    }
    duckGeo = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    duckMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  }
  if (!duckGeo) throw new Error('could not build the duck');
  return new THREE.Mesh(duckGeo, duckMat);
}
