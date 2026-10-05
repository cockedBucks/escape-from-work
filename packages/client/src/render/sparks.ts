import * as THREE from 'three';
import type { CarSnap } from '../net/snapshots';
import { SPARKS } from './look';

const N = SPARKS.maxParticles;
const SIDES = [-1, 1] as const;

/**
 * Drift dust and spark levels at the rear wheels, flames while a drift boost runs. A fixed
 * pool in one InstancedMesh with per-particle colors (one draw call, no per-frame
 * allocations); the oldest particle is reused when the pool is full.
 */
export class Sparks {
  readonly mesh: THREE.InstancedMesh;
  private readonly px = new Float32Array(N);
  private readonly py = new Float32Array(N);
  private readonly pz = new Float32Array(N);
  private readonly vx = new Float32Array(N);
  private readonly vy = new Float32Array(N);
  private readonly vz = new Float32Array(N);
  private readonly size = new Float32Array(N);
  private readonly life = new Float32Array(N);
  private readonly fall = new Float32Array(N);
  /** Age in seconds; ≥ life = free. */
  private readonly age = new Float32Array(N).fill(Infinity);
  private next = 0;
  private readonly lastDrift = new Map<string, number>();
  private readonly lastBoost = new Map<string, number>();
  private readonly m = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly every: number;

  constructor(particles: 'reduced' | 'normal') {
    this.every = particles === 'reduced' ? 2 : 1;
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), N);
    this.mesh.setColorAt(0, this.color.set(SPARKS.dust)); // creates the per-particle color buffer
    this.mesh.frustumCulled = false; // particles are everywhere; the box would be stale
    this.mesh.count = 0;
  }

  /** Emit for every drifting or boosting car, then move and age every particle. `now` ms, `dt` s. */
  update(now: number, dt: number, cars: ReadonlyMap<string, CarSnap>): void {
    for (const [id, car] of cars) {
      if (car.respawning) continue;
      if (car.drift !== 0 && now - (this.lastDrift.get(id) ?? -Infinity) >= SPARKS.driftEveryMs * this.every) {
        this.lastDrift.set(id, now);
        this.wheels(car);
      }
      if ((car.boosting || car.nitroOn) && now - (this.lastBoost.get(id) ?? -Infinity) >= SPARKS.boostEveryMs * this.every) {
        this.lastBoost.set(id, now);
        this.flame(car, car.nitroOn ? SPARKS.nitroFlameScale : 1);
      }
    }
    let highest = 0;
    for (let i = 0; i < N; i++) {
      const life = this.life[i]!;
      if (this.age[i]! >= life) continue;
      const a = this.age[i]! + dt;
      this.age[i] = a;
      this.vy[i] = this.vy[i]! - this.fall[i]! * dt;
      this.px[i] = this.px[i]! + this.vx[i]! * dt;
      this.py[i] = Math.max(0.05, this.py[i]! + this.vy[i]! * dt);
      this.pz[i] = this.pz[i]! + this.vz[i]! * dt;
      const s = a >= life ? 0 : this.size[i]! * (1 - a / life);
      this.m.makeScale(s, s, s).setPosition(this.px[i]!, this.py[i]!, this.pz[i]!);
      this.mesh.setMatrixAt(i, this.m);
      highest = i + 1;
    }
    this.mesh.count = highest;
    this.mesh.instanceMatrix.needsUpdate = highest > 0;
  }

  /** Dust (level 0) or the level's sparks from both rear wheels. */
  private wheels(car: CarSnap): void {
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const spark = car.driftLevel > 0;
    const color = spark ? SPARKS.levels[Math.min(car.driftLevel, SPARKS.levels.length) - 1]! : SPARKS.dust;
    for (const side of SIDES) {
      // The car's left is (cos yaw, -sin yaw).
      const x = car.x - fx * SPARKS.rearBack + fz * SPARKS.rearSide * side;
      const z = car.z - fz * SPARKS.rearBack - fx * SPARKS.rearSide * side;
      const back = SPARKS.throwBack * (0.5 + Math.random());
      const sideways = (Math.random() - 0.5) * 2;
      const up = SPARKS.kickUp * (spark ? 0.5 + Math.random() : 0.3);
      this.emit(x, car.y + SPARKS.rearHeight, z, -fx * back + fz * sideways, up, -fz * back - fx * sideways,
        spark ? SPARKS.sparkSize : SPARKS.dustSize, spark ? SPARKS.sparkLife : SPARKS.dustLife, spark ? SPARKS.gravity : 0, color);
    }
  }

  /** A flame puff out of the back of the car (`scale` > 1 = nitro's bigger flames). */
  private flame(car: CarSnap, scale: number): void {
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const color = SPARKS.flames[Math.random() < 0.5 ? 0 : 1]!;
    this.emit(car.x - fx * SPARKS.rearBack, car.y + SPARKS.rearHeight * 2, car.z - fz * SPARKS.rearBack,
      -fx * SPARKS.flameBack, 0.5, -fz * SPARKS.flameBack,
      SPARKS.flameSize * scale * (0.7 + Math.random() * 0.6), SPARKS.flameLife * scale, 0, color);
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, fall: number, color: number): void {
    const i = this.next;
    this.next = (this.next + 1) % N;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.size[i] = size;
    this.life[i] = life;
    this.fall[i] = fall;
    this.age[i] = 0;
    this.mesh.setColorAt(i, this.color.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
