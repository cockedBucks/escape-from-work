// Ghost of your best lap (P11.1). The page records where your car is drawn every frame,
// cuts the path into laps, keeps the fastest lap per track in this browser, and plays it back
// as a see-through car in later races. Visual only: the server and the sim never see it.
import { angleDiff } from '@escape/shared';
import { GHOST } from '../render/look';

/** One stored lap: the path at a fixed rate, from the moment the lap began. */
export interface GhostLap {
  track: string;
  /** Roster car id it was driven in (the ghost is drawn as that car). */
  car: string;
  /** Lap time as recorded on this page (ms). */
  lapMs: number;
  /** Samples per second in `f`. */
  hz: number;
  /** x, y, z, yaw per sample, flattened. */
  f: number[];
}

export interface GhostPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const FIELDS = 4;
const STORE_PREFIX = 'efw.ghost.';

/** Records drawn poses for one lap at a time. */
export class GhostRecorder {
  private times: number[] = [];
  private poses: number[] = [];
  private startMs = -1;
  private broken = false;

  /** A lap begins at `now` (ms): forget anything recorded before. */
  start(now: number): void {
    this.times = [];
    this.poses = [];
    this.startMs = now;
    this.broken = false;
  }

  /** Stop recording without keeping anything (race over, car changed). */
  abort(): void {
    this.startMs = -1;
    this.times = [];
    this.poses = [];
  }

  get recording(): boolean {
    return this.startMs >= 0;
  }

  /** Your car is drawn here at `now` (call once per frame while racing). */
  add(now: number, x: number, y: number, z: number, yaw: number): void {
    if (this.startMs < 0 || this.broken) return;
    const last = this.times.length > 0 ? this.times[this.times.length - 1]! : this.startMs;
    if (now < last) return;
    if (now - last > GHOST.maxGapMs || now - this.startMs > GHOST.maxLapSeconds * 1000) {
      this.broken = true; // a hidden tab or a stuck car: this lap's path is not worth keeping
      return;
    }
    this.times.push(now);
    this.poses.push(x, y, z, yaw);
  }

  /**
   * The lap ended at `now`: the recorded lap, resampled to `GHOST.hz`, or null when there is
   * nothing usable (no lap start seen, a gap, too few frames). Recording stops either way.
   */
  finish(now: number, track: string, car: string): GhostLap | null {
    const start = this.startMs;
    const ok = start >= 0 && !this.broken && this.times.length >= 2 && now - this.times[this.times.length - 1]! <= GHOST.maxGapMs;
    const lap = ok ? resample(this.times, this.poses, start, now, GHOST.hz) : null;
    this.abort();
    return lap === null ? null : { track, car, lapMs: Math.round(now - start), hz: GHOST.hz, f: lap };
  }
}

/** Poses at `start + k / hz` for every k up to `end`, linearly between recorded frames. */
function resample(times: readonly number[], poses: readonly number[], start: number, end: number, hz: number): number[] {
  const out: number[] = [];
  const step = 1000 / hz;
  let i = 0;
  for (let t = start; t <= end; t += step) {
    while (i < times.length - 1 && times[i + 1]! <= t) i++;
    const t0 = times[i]!;
    const t1 = times[Math.min(i + 1, times.length - 1)]!;
    const a = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    const j = Math.min(i + 1, times.length - 1);
    for (let k = 0; k < FIELDS; k++) {
      const p0 = poses[i * FIELDS + k]!;
      const p1 = poses[j * FIELDS + k]!;
      out.push(round(k === 3 ? p0 + angleDiff(p0, p1) * a : p0 + (p1 - p0) * a, k === 3 ? 1000 : 100));
    }
  }
  return out;
}

const round = (v: number, scale: number): number => Math.round(v * scale) / scale;

/** Where the ghost is `elapsedMs` into its lap, or null once its lap is over. */
export function ghostPoseAt(lap: GhostLap, elapsedMs: number, out: GhostPose): GhostPose | null {
  const n = lap.f.length / FIELDS;
  if (n === 0 || elapsedMs < 0 || elapsedMs > lap.lapMs) return null;
  const pos = (elapsedMs / 1000) * lap.hz;
  const i = Math.min(Math.floor(pos), n - 1);
  const j = Math.min(i + 1, n - 1);
  const a = Math.min(1, pos - i);
  const f = lap.f;
  out.x = f[i * FIELDS]! + (f[j * FIELDS]! - f[i * FIELDS]!) * a;
  out.y = f[i * FIELDS + 1]! + (f[j * FIELDS + 1]! - f[i * FIELDS + 1]!) * a;
  out.z = f[i * FIELDS + 2]! + (f[j * FIELDS + 2]! - f[i * FIELDS + 2]!) * a;
  out.yaw = f[i * FIELDS + 3]! + angleDiff(f[i * FIELDS + 3]!, f[j * FIELDS + 3]!) * a;
  return out;
}

/** A stored ghost, checked; null when missing, junk or for another track. */
export function parseGhost(raw: string | null, track: string): GhostLap | null {
  if (raw === null) return null;
  try {
    const g = JSON.parse(raw) as Partial<GhostLap>;
    const valid =
      g.track === track &&
      typeof g.car === 'string' &&
      typeof g.lapMs === 'number' && g.lapMs > 0 &&
      typeof g.hz === 'number' && g.hz > 0 &&
      Array.isArray(g.f) && g.f.length >= FIELDS && g.f.length % FIELDS === 0 &&
      g.f.every((v) => typeof v === 'number' && Number.isFinite(v));
    return valid ? (g as GhostLap) : null;
  } catch {
    return null;
  }
}

/** Your best lap on this track in this browser (null = none, or storage blocked). */
export function loadGhost(track: string): GhostLap | null {
  try {
    return parseGhost(window.localStorage.getItem(STORE_PREFIX + track), track);
  } catch {
    return null;
  }
}

/** Keep `lap` when it beats the stored one. Returns true when it is the new best. */
export function keepIfBest(lap: GhostLap, best: GhostLap | null): boolean {
  if (best !== null && best.lapMs <= lap.lapMs) return false;
  try {
    window.localStorage.setItem(STORE_PREFIX + lap.track, JSON.stringify(lap));
  } catch {
    // storage blocked or full: it still races you on this page
  }
  return true;
}

/**
 * Lap starts and ends from the synced race state: the race going green starts lap 1, every
 * `lapsDone` step ends one lap (and starts the next unless you finished).
 */
export class LapWatch {
  /** null until the first patch: a page (re)loaded mid-lap must wait for the next lap start. */
  private phase: string | null = null;
  private lapsDone = 0;

  /** Feed each state patch; says whether a lap ended and/or started now. */
  update(phase: string, lapsDone: number, finished: boolean): { ended: boolean; started: boolean; stopped: boolean } {
    const wasRacing = this.phase === 'racing';
    const racing = phase === 'racing';
    const out = { ended: false, started: false, stopped: false };
    if (this.phase === null) {
      // First look: nothing to start or end yet.
    } else if (racing && !wasRacing) {
      out.started = !finished;
    } else if (racing && lapsDone > this.lapsDone) {
      out.ended = true;
      out.started = !finished;
    } else if (!racing && wasRacing) {
      out.stopped = true;
    }
    this.phase = phase;
    this.lapsDone = lapsDone;
    return out;
  }
}
