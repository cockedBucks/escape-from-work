import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';
import { emptyLeague, LeagueSchema, RaceRecordSchema, type LeagueData, type RaceRecord } from '@escape/shared';
import { REPO_ROOT } from '../config';

/** The league file on the host PC (gitignored). */
export const LEAGUE_FILE = path.join(REPO_ROOT, 'data', 'league.json');

/** `league.json` → `league.corrupt-2026-10-06T12-30-00-000Z.json` (a safe file name on every OS). */
export function corruptName(file: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return path.join(path.dirname(file), `${path.basename(file, '.json')}.corrupt-${stamp}.json`);
}

/** Windows can hold a file for a moment (antivirus, indexer, an editor): retry these. */
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_TRIES = 5;
const RENAME_WAIT_MS = 50;

const sleepSync = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

function renameRetrying(from: string, to: string): void {
  for (let i = 1; ; i++) {
    try {
      renameSync(from, to);
      return;
    } catch (err) {
      if (i >= RENAME_TRIES || !BUSY.has((err as NodeJS.ErrnoException).code ?? '')) throw err;
      sleepSync(RENAME_WAIT_MS * i);
    }
  }
}

const message = (err: unknown): string => String(err instanceof Error ? err.message : err).split('\n')[0] ?? '';

/**
 * The league store: the race history in one JSON file, written atomically (a temp file flushed
 * to disk, then renamed over the old one, so neither a crash nor a power cut leaves half a
 * file). A file that is not valid league data is renamed aside (kept for a human to look at)
 * and the league starts empty. A file that cannot be READ (locked, no permission) is left alone
 * and this run keeps no league: nothing ever stops the server or loses a good file.
 */
export class LeagueStore {
  private league: LeagueData;
  /** Where a corrupt file was moved this run (null = none). */
  readonly backedUp: string | null = null;
  /** Why this run does not save (null = it does). */
  readonly disabled: string | null = null;

  constructor(
    private readonly file = LEAGUE_FILE,
    now: () => Date = () => new Date(),
    private readonly log: (msg: string) => void = (msg) => console.warn(msg),
  ) {
    const loaded = this.load();
    this.league = emptyLeague();
    if (loaded.kind === 'ok') {
      this.league = loaded.data;
    } else if (loaded.kind === 'unreadable') {
      this.disabled = `could not read ${path.basename(file)} (${loaded.problem})`;
      this.log(`[league] ${this.disabled}; it is left as it is and this run keeps no league`);
    } else if (loaded.kind === 'corrupt') {
      const aside = corruptName(file, now());
      try {
        renameRetrying(file, aside);
        this.backedUp = aside;
        this.log(`[league] ${path.basename(file)} was not valid (${loaded.problem}); moved it to ${path.basename(aside)} and started a new league`);
      } catch (err) {
        this.disabled = `${path.basename(file)} is not valid and could not be moved aside (${message(err)})`;
        this.log(`[league] ${this.disabled}; this run keeps no league`);
      }
    }
  }

  /** The current league (read-only; add races with `addRace`). */
  get data(): Readonly<LeagueData> {
    return this.league;
  }

  /**
   * Record a finished race and save. Throws if the record is malformed (a bug, not user data) or
   * the save failed (the race stays in memory, so the next save writes it too).
   */
  addRace(race: RaceRecord): void {
    if (this.disabled !== null) return;
    const checked = RaceRecordSchema.parse(race);
    this.league = { ...this.league, races: [...this.league.races, checked] };
    this.save();
  }

  private load():
    | { kind: 'ok'; data: LeagueData }
    | { kind: 'missing' }
    | { kind: 'unreadable'; problem: string }
    | { kind: 'corrupt'; problem: string } {
    if (!existsSync(this.file)) return { kind: 'missing' }; // first run: nothing to back up
    let text: string;
    try {
      text = readFileSync(this.file, 'utf8');
    } catch (err) {
      return { kind: 'unreadable', problem: message(err) };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      return { kind: 'corrupt', problem: `not JSON: ${message(err)}` };
    }
    const parsed = LeagueSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { kind: 'corrupt', problem: first ? `${first.path.join('.') || 'file'}: ${first.message}` : 'invalid' };
    }
    return { kind: 'ok', data: parsed.data };
  }

  private save(): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    // A unique temp name (two servers never share one), flushed to disk before the rename.
    const tmp = `${this.file}.${process.pid}.${Date.now().toString(36)}.tmp`;
    const fd = openSync(tmp, 'w');
    try {
      writeSync(fd, `${JSON.stringify(this.league, null, 1)}\n`, null, 'utf8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      renameRetrying(tmp, this.file); // atomic replace (also on Windows)
    } catch (err) {
      rmSync(tmp, { force: true });
      throw err;
    }
  }
}
