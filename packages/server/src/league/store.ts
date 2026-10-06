import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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

/**
 * The league store: the race history in one JSON file, written atomically (a temp file, then
 * rename, so a crash mid-write never leaves half a file). A file that is not valid league data
 * is renamed aside (kept for a human to look at) and the league starts empty, so a bad file can
 * never stop the server.
 */
export class LeagueStore {
  private league: LeagueData;
  /** Where a corrupt file was moved this run (null = none). */
  readonly backedUp: string | null = null;

  constructor(
    private readonly file = LEAGUE_FILE,
    now: () => Date = () => new Date(),
    private readonly log: (msg: string) => void = (msg) => console.warn(msg),
  ) {
    const loaded = this.load();
    if (loaded.ok) {
      this.league = loaded.data;
    } else {
      this.league = emptyLeague();
      if (loaded.problem !== null) {
        const aside = corruptName(file, now());
        renameSync(file, aside);
        this.backedUp = aside;
        this.log(`[league] ${path.basename(file)} was not valid (${loaded.problem}); moved it to ${path.basename(aside)} and started a new league`);
      }
    }
  }

  /** The current league (read-only; add races with `addRace`). */
  get data(): Readonly<LeagueData> {
    return this.league;
  }

  /** Record a finished race and save. Throws if the record is malformed (a bug, not user data). */
  addRace(race: RaceRecord): void {
    const checked = RaceRecordSchema.parse(race);
    this.league = { ...this.league, races: [...this.league.races, checked] };
    this.save();
  }

  private load(): { ok: true; data: LeagueData } | { ok: false; problem: string | null } {
    if (!existsSync(this.file)) return { ok: false, problem: null }; // first run: nothing to back up
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch (err) {
      return { ok: false, problem: `not JSON: ${String(err instanceof Error ? err.message : err).split('\n')[0]}` };
    }
    const parsed = LeagueSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { ok: false, problem: first ? `${first.path.join('.') || 'file'}: ${first.message}` : 'invalid' };
    }
    return { ok: true, data: parsed.data };
  }

  private save(): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.league, null, 1)}\n`, 'utf8');
    renameSync(tmp, this.file); // atomic replace (also on Windows)
  }
}
