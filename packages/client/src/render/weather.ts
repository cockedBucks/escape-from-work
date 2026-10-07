import type { TrackDef } from '@escape/shared';
import * as THREE from 'three';
import { LIGHT, SANDSTORM } from './look';

/**
 * Weather on the scene: blends the normal light fog into the track's sandstorm and back.
 * Edits the stage's own Fog and background objects (no per-frame allocations).
 */
export class Weather {
  /** 0 = clear, 1 = full sandstorm. */
  amount = 0;
  private readonly clear = new THREE.Color(LIGHT.sky);
  private readonly sand = new THREE.Color(SANDSTORM.color);

  constructor(
    private readonly fog: THREE.Fog,
    private readonly background: THREE.Color,
    private readonly storm: TrackDef['sandstorm'],
  ) {}

  update(stormOn: boolean, dt: number): void {
    if (!this.storm) return;
    const target = stormOn ? 1 : 0;
    if (this.amount === target) return;
    const stepBy = dt / SANDSTORM.fadeSeconds;
    this.amount = target > this.amount ? Math.min(target, this.amount + stepBy) : Math.max(target, this.amount - stepBy);
    const k = this.amount;
    this.fog.near = LIGHT.fogNear + (this.storm.fogNear - LIGHT.fogNear) * k;
    this.fog.far = LIGHT.fogFar + (this.storm.fogFar - LIGHT.fogFar) * k;
    this.fog.color.copy(this.clear).lerp(this.sand, k);
    this.background.copy(this.fog.color);
  }
}
