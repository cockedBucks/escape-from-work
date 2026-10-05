import { angleDiff } from '@escape/shared';
import { followAlpha } from '../render/cameras';

/** Smallest head change worth sending (rad): about half a degree. */
const SEND_EPSILON = 0.01;
/** Other players' heads ease toward the synced angle at this rate (1/s). */
const SMOOTH_RATE = 12;

/**
 * Decides when to send your head angles: at most every `intervalMs`, and only when they
 * moved noticeably (looking straight ahead costs nothing).
 */
export class HeadSender {
  private lastSent = -Infinity;
  private yaw = 0;
  private pitch = 0;

  /** Returns the angles to send now, or null. */
  next(now: number, yaw: number, pitch: number, intervalMs: number): { yaw: number; pitch: number } | null {
    if (now - this.lastSent < intervalMs) return null;
    if (Math.abs(yaw - this.yaw) < SEND_EPSILON && Math.abs(pitch - this.pitch) < SEND_EPSILON) return null;
    this.lastSent = now;
    this.yaw = yaw;
    this.pitch = pitch;
    return { yaw, pitch };
  }
}

/** Smoothed head angles of other players (synced ~20/s, drawn every frame). */
export class HeadSmoother {
  private readonly heads = new Map<string, { yaw: number; pitch: number }>();

  /** Advance one frame toward the latest synced angles; returns the smoothed pose. */
  step(id: string, targetYaw: number, targetPitch: number, dt: number): { yaw: number; pitch: number } {
    let h = this.heads.get(id);
    if (!h) {
      h = { yaw: targetYaw, pitch: targetPitch };
      this.heads.set(id, h);
    }
    const a = followAlpha(SMOOTH_RATE, dt);
    h.yaw += angleDiff(h.yaw, targetYaw) * a;
    h.pitch += (targetPitch - h.pitch) * a;
    return h;
  }

  forget(id: string): void {
    this.heads.delete(id);
  }
}
