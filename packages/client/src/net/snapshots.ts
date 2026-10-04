import { RingBuffer, angleDiff, lerp } from '@escape/shared';

/** What the client draws for one car. */
export interface CarSnap {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  steer: number;
  respawning: boolean;
  ghost: boolean;
}

interface Snapshot {
  /** Client time (ms) when this state arrived (or was simulated, in scenarios). */
  t: number;
  cars: Map<string, CarSnap>;
}

/** How many snapshots to keep: ~1 s at 30 patches/s is plenty for interpolation. */
const CAPACITY = 32;

/**
 * Keeps recent server snapshots and blends between the two around a render time in the
 * past, so cars move smoothly even though patches arrive only ~30 times per second.
 */
export class SnapshotBuffer {
  private readonly buf = new RingBuffer<Snapshot>(CAPACITY);

  push(t: number, cars: Map<string, CarSnap>): void {
    const newest = this.buf.newest();
    if (newest && t < newest.t) return; // never go back in time
    this.buf.push({ t, cars });
  }

  get size(): number {
    return this.buf.size;
  }

  /**
   * Fill `out` with every car's state at `renderT`. Reuses the objects already in `out`
   * and removes cars that are gone. Before the oldest / after the newest snapshot it
   * holds that snapshot (never guesses ahead).
   */
  sample(renderT: number, out: Map<string, CarSnap>): void {
    const n = this.buf.size;
    if (n === 0) {
      out.clear();
      return;
    }
    let a = this.buf.get(0) as Snapshot;
    let b = a;
    for (let i = 1; i < n; i++) {
      const s = this.buf.get(i) as Snapshot;
      if (s.t <= renderT) a = s;
      b = s;
      if (s.t >= renderT) break;
    }
    if (renderT <= a.t) b = a;
    const span = b.t - a.t;
    const alpha = span > 0 ? Math.min(Math.max((renderT - a.t) / span, 0), 1) : 1;

    for (const id of out.keys()) if (!b.cars.has(id)) out.delete(id);
    for (const [id, cb] of b.cars) {
      const ca = a.cars.get(id) ?? cb;
      let o = out.get(id);
      if (!o) {
        o = { ...cb };
        out.set(id, o);
      }
      o.x = lerp(ca.x, cb.x, alpha);
      o.y = lerp(ca.y, cb.y, alpha);
      o.z = lerp(ca.z, cb.z, alpha);
      o.yaw = ca.yaw + angleDiff(ca.yaw, cb.yaw) * alpha;
      o.speed = lerp(ca.speed, cb.speed, alpha);
      o.steer = lerp(ca.steer, cb.steer, alpha);
      o.respawning = cb.respawning;
      o.ghost = cb.ghost;
    }
  }

  clear(): void {
    this.buf.clear();
  }
}
