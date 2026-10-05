import * as THREE from 'three';
import type { CarSnap } from '../net/snapshots';
import { SMOKE } from './look';

/** Puff radius at age `t` (0–1 of its life): swell fast, then shrink away. */
export function puffSize(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  const peakAt = 1 / 3;
  return t < peakAt
    ? SMOKE.startSize + (SMOKE.peakSize - SMOKE.startSize) * (t / peakAt)
    : SMOKE.peakSize * (1 - (t - peakAt) / (1 - peakAt));
}

/**
 * Smoke puffs over stalled engines. A fixed pool in one InstancedMesh (one draw call, no
 * per-frame allocations); the oldest puff is reused when the pool is full.
 */
export class Smoke {
  readonly mesh: THREE.InstancedMesh;
  private readonly x = new Float32Array(SMOKE.maxPuffs);
  private readonly y = new Float32Array(SMOKE.maxPuffs);
  private readonly z = new Float32Array(SMOKE.maxPuffs);
  private readonly vx = new Float32Array(SMOKE.maxPuffs);
  private readonly vz = new Float32Array(SMOKE.maxPuffs);
  /** Age 0–1 of each puff (≥ 1 = free). */
  private readonly age = new Float32Array(SMOKE.maxPuffs).fill(1);
  private next = 0;
  private readonly lastPuff = new Map<string, number>();
  private readonly m = new THREE.Matrix4();
  private readonly emitMs: number;

  constructor(particles: 'reduced' | 'normal') {
    this.emitMs = particles === 'reduced' ? SMOKE.emitEveryMs * 2 : SMOKE.emitEveryMs;
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: SMOKE.color, flatShading: true }),
      SMOKE.maxPuffs,
    );
    this.mesh.frustumCulled = false; // puffs are everywhere; the box would be stale
    this.mesh.count = 0;
  }

  /** Emit from every stalled car, age and move every puff. `now` in ms, `dt` in s. */
  update(now: number, dt: number, cars: ReadonlyMap<string, CarSnap>): void {
    for (const [id, car] of cars) {
      if (!car.stalled || car.respawning) continue;
      const last = this.lastPuff.get(id) ?? -Infinity;
      if (now - last < this.emitMs) continue;
      this.lastPuff.set(id, now);
      this.emit(car);
    }
    let highest = 0;
    const step = dt / SMOKE.lifeSeconds;
    for (let i = 0; i < SMOKE.maxPuffs; i++) {
      if (this.age[i]! >= 1) continue;
      const a = Math.min(1, this.age[i]! + step);
      this.age[i] = a;
      this.x[i] = this.x[i]! + this.vx[i]! * dt;
      this.y[i] = this.y[i]! + SMOKE.rise * dt;
      this.z[i] = this.z[i]! + this.vz[i]! * dt;
      const s = puffSize(a);
      this.m.makeScale(s, s, s).setPosition(this.x[i]!, this.y[i]!, this.z[i]!);
      this.mesh.setMatrixAt(i, this.m);
      highest = i + 1;
    }
    this.mesh.count = highest;
    this.mesh.instanceMatrix.needsUpdate = highest > 0;
  }

  private emit(car: CarSnap): void {
    const i = this.next;
    this.next = (this.next + 1) % SMOKE.maxPuffs;
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    this.x[i] = car.x + fx * SMOKE.forward;
    this.y[i] = car.y + SMOKE.height;
    this.z[i] = car.z + fz * SMOKE.forward;
    this.vx[i] = (Math.random() - 0.5) * 2 * SMOKE.drift;
    this.vz[i] = (Math.random() - 0.5) * 2 * SMOKE.drift;
    this.age[i] = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
