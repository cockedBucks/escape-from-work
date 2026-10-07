import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigError, DEFAULT_TRACK, checkTrack, parseTrack, parseTuning, type CarsConfig, type ItemsConfig, type TeamsConfig, type Track, type Tuning } from '@escape/shared';
import { REPO_ROOT, loadCarsFile, loadItemsFile, loadTeamsFile, loadTrackFile, loadTuningFile } from './config';

export type ConfigChange =
  | { kind: 'tuning'; tuning: Tuning }
  | { kind: 'cars'; cars: CarsConfig }
  /** A track file changed (dev): every game on track `id` reloads it. */
  | { kind: 'track'; id: string; track: Track };

type Listener = (change: ConfigChange) => void;


/**
 * The server's current config (tuning, cars, track). Rooms and dev routes share it. In dev it
 * changes live: from the F2 panel (`setTuning`), or when a file in `config/` is edited
 * (`reload*`). Listeners hear every accepted change; invalid data is rejected and changes
 * nothing.
 */
export class LiveConfig {
  tuning: Tuning;
  cars: CarsConfig;
  /** Default team names (read once at start). */
  readonly teams: TeamsConfig;
  /** Chaos items (read once at start). */
  readonly items: ItemsConfig;
  /** The always-open game's starting track (DEFAULT_TRACK). */
  track: Track;
  private currentTrackId: string = DEFAULT_TRACK;
  private readonly listeners = new Set<Listener>();
  /** Tracks games picked, by id (built and checked once; dropped when the file changes). */
  private readonly trackCache = new Map<string, Track>();

  constructor(readonly configDir = path.join(REPO_ROOT, 'config')) {
    this.tuning = loadTuningFile(this.tuningFile);
    this.cars = loadCarsFile(path.join(configDir, 'cars.json'));
    this.teams = loadTeamsFile(path.join(configDir, 'teams.json'));
    this.items = loadItemsFile(path.join(configDir, 'items.json'));
    this.track = loadTrackFile(this.trackId, this.tuning, path.join(configDir, 'tracks'));
  }

  /** The track raced now (a config/tracks file id). */
  get trackId(): string {
    return this.currentTrackId;
  }

  /** Tracks the host may pick: every valid track file that is not a dev track, sorted. */
  availableTracks(): string[] {
    const dir = path.join(this.configDir, 'tracks');
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -'.json'.length))
      .filter((id) => {
        try {
          return !parseTrack(JSON.parse(readFileSync(path.join(dir, `${id}.json`), 'utf8')), id).dev;
        } catch {
          return false; // a broken file is simply not offered
        }
      })
      .sort();
  }

  /**
   * A track a game may race (P12.1: every game has its own): built and checked, or why not
   * (unknown / dev / broken track) as a string.
   */
  trackById(id: string): Track | string {
    const cached = this.trackCache.get(id);
    if (cached) return cached;
    if (!this.availableTracks().includes(id)) return 'there is no such track';
    try {
      const track = this.loadChecked(id);
      this.trackCache.set(id, track);
      return track;
    } catch (err) {
      return `that track does not work: ${String(err instanceof Error ? err.message : err).split('\n')[0]}`;
    }
  }

  private loadChecked(id: string): Track {
    const track = loadTrackFile(id, this.tuning, path.join(this.configDir, 'tracks'));
    const { issues } = checkTrack(track, this.tuning.track.minWidth, this.tuning.track.branchMinWidth);
    if (issues.length > 0) throw new ConfigError(`track ${id}: ${issues.join('; ')}`);
    return track;
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

  /** Dev: the file of track `id` changed. Games on it reload it; a broken file throws and changes nothing. */
  reloadTrack(id = this.trackId): void {
    const track = this.loadChecked(id);
    this.trackCache.set(id, track);
    if (id === this.trackId) this.track = track;
    this.emit({ kind: 'track', id, track });
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
