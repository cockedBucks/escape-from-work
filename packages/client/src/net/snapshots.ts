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
  /** Engine stalled (smoke). */
  stalled: boolean;
  /** Drifting (-1 left / 0 / +1 right) and the spark level 0–3; drift boost on. */
  drift: number;
  driftLevel: number;
  boosting: boolean;
  /** Burning nitro (big flames). */
  nitroOn: boolean;
  /** Firewall up (bubble). */
  shielded: boolean;
}

interface Snapshot {
  /** Client time (ms) when this state arrived (or was simulated, in scenarios). */
  t: number;
  cars: Map<string, CarSnap>;
}

/** How many snapshots to keep: ~1 s at 30 patches/s is plenty for interpolation. */
const CAPACITY = 32;
/** A car that moved further than this between two snapshots (m) teleported (respawn,
 *  track reset): draw it at the new spot instead of sliding it across the map. */
const TELEPORT_DISTANCE = 15;

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

  /** Did the last `sample` run past the newest snapshot (the buffer ran dry)? For F3 and tests. */
  starved = false;

  /**
   * Fill `out` with every car's state at `renderT`. Reuses the objects already in `out`
   * and removes cars that are gone. Before the oldest snapshot it holds that one. After the
   * newest (a late patch) it keeps each car moving along its last motion for at most
   * `extrapolateMs`, then holds (P13.1: a late Wi-Fi patch no longer freezes the car).
   */
  sample(renderT: number, out: Map<string, CarSnap>, extrapolateMs = 0): void {
    const n = this.buf.size;
    if (n === 0) {
      out.clear();
      this.starved = false;
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
    let span = b.t - a.t;
    let alpha = span > 0 ? Math.min(Math.max((renderT - a.t) / span, 0), 1) : 1;
    this.starved = n > 1 && renderT > b.t;
    if (this.starved && extrapolateMs > 0) {
      // Past the newest: extrapolate from the two newest snapshots.
      a = this.buf.get(n - 2) as Snapshot;
      span = b.t - a.t;
      alpha = span > 0 ? 1 + Math.min(renderT - b.t, extrapolateMs) / span : 1;
    }

    for (const id of out.keys()) if (!b.cars.has(id)) out.delete(id);
    for (const [id, cb] of b.cars) {
      const prev = a.cars.get(id) ?? cb;
      const ca = Math.hypot(cb.x - prev.x, cb.z - prev.z) > TELEPORT_DISTANCE ? cb : prev;
      let o = out.get(id);
      if (!o) {
        o = { ...cb };
        out.set(id, o);
      }
      o.x = lerp(ca.x, cb.x, alpha);
      o.y = Math.max(lerp(ca.y, cb.y, alpha), 0); // extrapolating a landing car: not below the ground
      o.z = lerp(ca.z, cb.z, alpha);
      o.yaw = ca.yaw + angleDiff(ca.yaw, cb.yaw) * alpha;
      o.speed = lerp(ca.speed, cb.speed, alpha);
      o.steer = lerp(ca.steer, cb.steer, alpha);
      o.respawning = cb.respawning;
      o.ghost = cb.ghost;
      o.stalled = cb.stalled;
      o.drift = cb.drift;
      o.driftLevel = cb.driftLevel;
      o.boosting = cb.boosting;
      o.nitroOn = cb.nitroOn;
      o.shielded = cb.shielded;
    }
  }

  clear(): void {
    this.buf.clear();
  }
}
