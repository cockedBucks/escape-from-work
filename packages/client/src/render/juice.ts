import { JUICE } from './look';

/**
 * Landing squash and stretch: a damped spring around 0. A landing sets it squashed
 * (negative); it springs back and overshoots a little = the stretch.
 */
export class Squash {
  value = 0;
  private vel = 0;

  /** A landing at `impact` m/s (downward speed). */
  land(impact: number): void {
    this.value = -Math.min(impact * JUICE.squashPerImpact, JUICE.squashMax);
    this.vel = 0;
  }

  step(dt: number): void {
    if (this.value === 0 && this.vel === 0) return;
    const k = JUICE.squashStiffness;
    // Small fixed slices: a stiff spring blows up when one slow frame is a big step.
    for (let left = dt; left > 0; left -= JUICE.maxStep) {
      const h = Math.min(left, JUICE.maxStep);
      this.vel += (-k * k * this.value - 2 * JUICE.squashDamping * k * this.vel) * h;
      this.value += this.vel * h;
    }
    if (Math.abs(this.value) < JUICE.restEpsilon && Math.abs(this.vel) < JUICE.restEpsilon) {
      this.value = 0;
      this.vel = 0;
    }
  }

  /** Body scale: squashed = lower and wider (volume roughly kept). */
  get scaleY(): number {
    return 1 + this.value;
  }

  get scaleXZ(): number {
    return 1 - this.value * JUICE.squashWiden;
  }
}

/** Camera shake after a hit: a decaying wobble on two axes (meters). */
export class Shake {
  amp = 0;
  private t = 0;

  /** A hit at `impact` m/s: shake at least this hard (a bigger shake is not cut short). */
  hit(impact: number): void {
    this.amp = Math.max(this.amp, Math.min(impact * JUICE.shakePerImpact, JUICE.shakeMax));
  }

  step(dt: number): void {
    this.t += dt;
    this.amp = this.amp * Math.exp(-JUICE.shakeDecay * dt);
    if (this.amp < JUICE.restEpsilon) this.amp = 0;
  }

  get x(): number {
    return this.amp * Math.sin(this.t * JUICE.shakeFreqA);
  }

  get y(): number {
    return this.amp * Math.sin(this.t * JUICE.shakeFreqB + 1);
  }
}

/** How hard a hit or landing kicks the bobbleheads (rad/s of tilt speed). */
export const headKick = (impact: number): number => Math.min(impact * JUICE.headKickPerImpact, JUICE.headKickMax);
