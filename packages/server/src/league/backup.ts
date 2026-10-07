import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const BACKUP_NAME = /^league-\d{4}-\d{2}-\d{2}\.json$/;

/**
 * Once a day (when the server starts): copy the league file to `<dir>/league-<date>.json`,
 * then keep only the newest `keep` copies. Returns the new copy's path, or null when there
 * is nothing to back up or today's copy already exists. Never throws (a backup must not stop
 * the game): a failure is returned as an Error.
 */
export function dailyBackup(leagueFile: string, dir: string, date: string, keep: number): string | null | Error {
  try {
    if (!existsSync(leagueFile)) return null;
    mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `league-${date}.json`);
    if (existsSync(target)) return null;
    copyFileSync(leagueFile, target);
    const old = readdirSync(dir).filter((f) => BACKUP_NAME.test(f)).sort().reverse().slice(keep);
    for (const f of old) rmSync(path.join(dir, f), { force: true });
    return target;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}
