// Photo-finish replay (P11.2). The page keeps the last few seconds of every car as it was
// drawn; when 1st and 2nd finish close together it cuts that clip and plays it back slowly
// from a camera at the finish line. Visual only.
import { angleDiff, type SectorGate } from '@escape/shared';
import type { CarSnap } from '../net/snapshots';
import { PHOTO } from '../render/look';

/** Per car per frame: x, y, z, yaw, speed, steer, drift, driftLevel, boosting, nitroOn. */
const F = 10;

/** Car slot from a server car id ("car3" → 3), or -1; cached, so recording allocates nothing per frame. */
const slotCache = new Map<string, number>();
const slotOfId = (id: string): number => {
  let slot = slotCache.get(id);
  if (slot === undefined) {
    const m = /^car(\d+)$/.exec(id);
    slot = m ? Number(m[1]) : -1;
    slotCache.set(id, slot);
  }
  return slot;
};

/** "car0", "car1", … built once (replay frames look cars up by slot). */
const CAR_IDS: string[] = [];
const carIdOf = (slot: number): string => (CAR_IDS[slot] ??= `car${slot}`);

/** A cut of recorded frames, oldest first. */
export interface ReplayClip {
  maxCars: number;
  times: number[];
  /** 1 where car `slot` was drawn in frame `i` (index `i * maxCars + slot`). */
  present: Uint8Array;
  data: Float32Array;
}

/** Keeps the last `seconds` of drawn car poses at `hz`, without allocating per frame. */
export class ReplayRecorder {
  private readonly cap: number;
  private readonly times: Float64Array;
  private readonly present: Uint8Array;
  private readonly data: Float32Array;
  private head = 0;
  private count = 0;
  private last = Number.NEGATIVE_INFINITY;

  constructor(private readonly maxCars: number, private readonly hz: number, seconds: number) {
    this.cap = Math.ceil(hz * seconds) + 1;
    this.times = new Float64Array(this.cap);
    this.present = new Uint8Array(this.cap * maxCars);
    this.data = new Float32Array(this.cap * maxCars * F);
  }

  /** The cars as drawn at `now` (ms); kept at most `hz` times per second. */
  record(now: number, snaps: ReadonlyMap<string, CarSnap>): void {
    if (now - this.last < 1000 / this.hz - 1) return;
    this.last = now;
    const i = this.head;
    this.times[i] = now;
    this.present.fill(0, i * this.maxCars, (i + 1) * this.maxCars);
    snaps.forEach(this.put);
    this.head = (this.head + 1) % this.cap;
    this.count = Math.min(this.count + 1, this.cap);
  }

  /** One car into the frame at `head` (a bound method, so `forEach` allocates nothing). */
  private readonly put = (s: CarSnap, id: string): void => {
    const slot = slotOfId(id);
    if (slot < 0 || slot >= this.maxCars) return;
    const i = this.head;
    this.present[i * this.maxCars + slot] = 1;
    const o = (i * this.maxCars + slot) * F;
    const d = this.data;
    d[o] = s.x;
    d[o + 1] = s.y;
    d[o + 2] = s.z;
    d[o + 3] = s.yaw;
    d[o + 4] = s.speed;
    d[o + 5] = s.steer;
    d[o + 6] = s.drift;
    d[o + 7] = s.driftLevel;
    d[o + 8] = s.boosting ? 1 : 0;
    d[o + 9] = s.nitroOn ? 1 : 0;
  };

  /** A copy of everything kept (oldest first). */
  clip(): ReplayClip {
    const n = this.count;
    const times: number[] = [];
    const present = new Uint8Array(n * this.maxCars);
    const data = new Float32Array(n * this.maxCars * F);
    for (let k = 0; k < n; k++) {
      const i = (this.head - n + k + this.cap) % this.cap;
      times.push(this.times[i]!);
      present.set(this.present.subarray(i * this.maxCars, (i + 1) * this.maxCars), k * this.maxCars);
      data.set(this.data.subarray(i * this.maxCars * F, (i + 1) * this.maxCars * F), k * this.maxCars * F);
    }
    return { maxCars: this.maxCars, times, present, data };
  }
}

/** Index of the last frame at or before `t` (0 before the first). */
function frameAt(clip: ReplayClip, t: number): number {
  let lo = 0;
  let hi = clip.times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (clip.times[mid]! <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Put the cars where the clip had them at time `t` (ms, clip clock): updates the snaps in
 * `out` (made if missing) for every car drawn in that frame. Cars not in the clip are left.
 */
export function sampleClip(clip: ReplayClip, t: number, out: Map<string, CarSnap>): void {
  if (clip.times.length === 0) return;
  const i = frameAt(clip, t);
  const j = Math.min(i + 1, clip.times.length - 1);
  const t0 = clip.times[i]!;
  const t1 = clip.times[j]!;
  const a = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  const d = clip.data;
  for (let slot = 0; slot < clip.maxCars; slot++) {
    if (!clip.present[i * clip.maxCars + slot]) continue;
    const both = clip.present[j * clip.maxCars + slot] === 1;
    const o = (i * clip.maxCars + slot) * F;
    const p = both ? (j * clip.maxCars + slot) * F : o;
    const id = carIdOf(slot);
    let s = out.get(id);
    if (!s) {
      s = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, steer: 0, respawning: false, ghost: false, stalled: false, drift: 0, driftLevel: 0, boosting: false, nitroOn: false, shielded: false };
      out.set(id, s);
    }
    s.x = d[o]! + (d[p]! - d[o]!) * a;
    s.y = d[o + 1]! + (d[p + 1]! - d[o + 1]!) * a;
    s.z = d[o + 2]! + (d[p + 2]! - d[o + 2]!) * a;
    s.yaw = d[o + 3]! + angleDiff(d[o + 3]!, d[p + 3]!) * a;
    s.speed = d[o + 4]! + (d[p + 4]! - d[o + 4]!) * a;
    s.steer = d[o + 5]! + (d[p + 5]! - d[o + 5]!) * a;
    s.drift = d[o + 6]!;
    s.driftLevel = d[o + 7]!;
    s.boosting = d[o + 8] === 1;
    s.nitroOn = d[o + 9] === 1;
    s.respawning = false;
    s.ghost = false;
  }
}

/**
 * When (clip clock, ms) car `slot` crossed the line of `gate` going forward, between two
 * frames and on the road; the last such moment, or null.
 */
export function crossingTime(clip: ReplayClip, slot: number, gate: SectorGate): number | null {
  const fx = Math.sin(gate.yaw);
  const fz = Math.cos(gate.yaw);
  const half = Math.hypot(gate.right.x - gate.pos.x, gate.right.z - gate.pos.z);
  let found: number | null = null;
  for (let i = 0; i + 1 < clip.times.length; i++) {
    if (!clip.present[i * clip.maxCars + slot] || !clip.present[(i + 1) * clip.maxCars + slot]) continue;
    const a = (i * clip.maxCars + slot) * F;
    const b = ((i + 1) * clip.maxCars + slot) * F;
    const da = (clip.data[a]! - gate.pos.x) * fx + (clip.data[a + 2]! - gate.pos.z) * fz;
    const db = (clip.data[b]! - gate.pos.x) * fx + (clip.data[b + 2]! - gate.pos.z) * fz;
    if (!(da < 0 && db >= 0)) continue;
    const k = -da / (db - da);
    const x = clip.data[a]! + (clip.data[b]! - clip.data[a]!) * k;
    const z = clip.data[a + 2]! + (clip.data[b + 2]! - clip.data[a + 2]!) * k;
    if (Math.hypot(x - gate.pos.x, z - gate.pos.z) > half * 1.5) continue; // crossed the line's extension, not the road
    found = clip.times[i]! + (clip.times[i + 1]! - clip.times[i]!) * k;
  }
  return found;
}

/** A car's finish as the race state has it. */
export interface FinishedCar {
  slot: number;
  finished: boolean;
  /** Race time at the finish (ms, 0 = none). */
  finishMs: number;
}

/** The winner and runner-up when they finished at most `gapMs` apart; else null. */
export function photoFinishPair(cars: readonly FinishedCar[], gapMs: number): { winner: number; runnerUp: number; gapMs: number } | null {
  const done = cars.filter((c) => c.finished && c.finishMs > 0).sort((a, b) => a.finishMs - b.finishMs);
  const [first, second] = done;
  if (!first || !second) return null;
  const gap = second.finishMs - first.finishMs;
  return gap <= gapMs ? { winner: first.slot, runnerUp: second.slot, gapMs: gap } : null;
}

/**
 * The part of the clip to replay: from `lead` s before the winner crosses to `tail` s after the
 * runner-up (clamped to the clip); the whole clip when a crossing is not in it.
 */
export function replayWindow(clip: ReplayClip, winnerCross: number | null, runnerCross: number | null, lead: number, tail: number): { from: number; to: number } {
  const first = clip.times[0] ?? 0;
  const last = clip.times[clip.times.length - 1] ?? 0;
  if (winnerCross === null || runnerCross === null) return { from: first, to: last };
  return { from: Math.max(first, winnerCross - lead * 1000), to: Math.min(last, runnerCross + tail * 1000) };
}

/** The photo-finish camera: beside the road at the finish line, looking at the line's middle. */
export function photoCamera(gate: SectorGate): { from: [number, number, number]; at: [number, number, number] } {
  const rx = gate.right.x - gate.pos.x;
  const rz = gate.right.z - gate.pos.z;
  const len = Math.hypot(rx, rz) || 1;
  return {
    from: [gate.right.x + (rx / len) * PHOTO.camSide, PHOTO.camHeight, gate.right.z + (rz / len) * PHOTO.camSide],
    at: [gate.pos.x, PHOTO.lookHeight, gate.pos.z],
  };
}
