import { renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseTuning, type CarsConfig, type Track, type Tuning } from '@escape/shared';
import { REPO_ROOT, loadCarsFile, loadTrackFile, loadTuningFile } from './config';

export type ConfigChange =
  | { kind: 'tuning'; tuning: Tuning }
  | { kind: 'cars'; cars: CarsConfig }
  | { kind: 'track'; track: Track };

type Listener = (change: ConfigChange) => void;

/** Track used until the lobby can pick one (P3). */
export const DEFAULT_TRACK = 'test-loop';

/**
 * The server's current config (tuning, cars, track). Rooms and dev routes share it. In dev it
 * changes live: from the F2 panel (`setTuning`), or when a file in `config/` is edited
 * (`reload*`). Listeners hear every accepted change; invalid data is rejected and changes
 * nothing.
 */
export class LiveConfig {
  tuning: Tuning;
  cars: CarsConfig;
  track: Track;
  readonly trackId = DEFAULT_TRACK;
  private readonly listeners = new Set<Listener>();

  constructor(readonly configDir = path.join(REPO_ROOT, 'config')) {
    this.tuning = loadTuningFile(this.tuningFile);
    this.cars = loadCarsFile(path.join(configDir, 'cars.json'));
    this.track = loadTrackFile(this.trackId, this.tuning, path.join(configDir, 'tracks'));
  }

  get tuningFile(): string {
    return path.join(this.configDir, 'tuning.json');
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: ConfigChange): void {
    for (const l of this.listeners) l(change);
  }

  /** Apply new tuning in memory (validated). Throws `ConfigError` when invalid. */
  setTuning(raw: unknown, source = 'F2 panel'): Tuning {
    this.tuning = parseTuning(raw, source);
    this.emit({ kind: 'tuning', tuning: this.tuning });
    return this.tuning;
  }

  /** Validate, apply and write tuning.json atomically (temp file + rename). */
  saveTuning(raw: unknown): Tuning {
    const t = this.setTuning(raw);
    writeJsonAtomic(this.tuningFile, t);
    return t;
  }

  reloadTuning(): void {
    this.tuning = loadTuningFile(this.tuningFile);
    this.emit({ kind: 'tuning', tuning: this.tuning });
  }

  reloadCars(): void {
    this.cars = loadCarsFile(path.join(this.configDir, 'cars.json'));
    this.emit({ kind: 'cars', cars: this.cars });
  }

  reloadTrack(): void {
    this.track = loadTrackFile(this.trackId, this.tuning, path.join(this.configDir, 'tracks'));
    this.emit({ kind: 'track', track: this.track });
  }
}

/** Write JSON with 2-space indent and a final newline, never leaving a half-written file. */
export function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

let shared: LiveConfig | null = null;

/** The server-wide config. `startServer` sets it; rooms read it. */
export function liveConfig(): LiveConfig {
  if (!shared) shared = new LiveConfig();
  return shared;
}

export function setLiveConfig(cfg: LiveConfig): void {
  shared = cfg;
}
