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

/**
 * Kart drift look (P13.2): a quick hop when a drift starts (cosmetic: the sim stays on the
 * ground) and a lean out of the corner while drifting, eased in and out.
 */
export class DriftHop {
  private t = -1;
  private dir = 0;
  /** Body lift (m) and roll (rad, + = lean right) for this frame. */
  lift = 0;
  roll = 0;

  /** The car's drift this frame (-1 left / 0 / +1 right): a new drift hops. */
  step(drift: number, dt: number): void {
    if (drift !== 0 && this.dir === 0) this.t = 0;
    this.dir = drift;
    if (this.t >= 0) {
      this.t += dt;
      this.lift = this.t < JUICE.hopSeconds ? JUICE.hopHeight * Math.sin((Math.PI * this.t) / JUICE.hopSeconds) : 0;
      if (this.t >= JUICE.hopSeconds) this.t = -1;
    } else this.lift = 0;
    // Drifting left leans the body right (out of the corner), and the other way round.
    const want = -drift * JUICE.driftLean;
    this.roll += (want - this.roll) * Math.min(1, JUICE.driftLeanRate * dt);
  }
}

/** Jump trick look (P13.5): one full spin (rad, eased in and out) when a trick starts. */
export class TrickSpin {
  private t = -1;
  private was = false;
  angle = 0;

  step(trick: boolean, dt: number): void {
    if (trick && !this.was) this.t = 0;
    this.was = trick;
    if (this.t < 0) {
      this.angle = 0;
      return;
    }
    this.t += dt;
    const k = Math.min(this.t / JUICE.trickSeconds, 1);
    // Smoothstep: starts and ends gently, so the car settles straight for the landing.
    this.angle = 2 * Math.PI * k * k * (3 - 2 * k);
    if (k >= 1) {
      this.t = -1;
      this.angle = 0;
    }
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
