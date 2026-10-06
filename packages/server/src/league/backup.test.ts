import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dailyBackup } from './backup';

const dirs: string[] = [];
function temp(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'efw-backup-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('daily league backup (P10.4)', () => {
  it('copies the league once per day and keeps only the newest copies', () => {
    const root = temp();
    const file = path.join(root, 'league.json');
    const dir = path.join(root, 'backups');
    writeFileSync(file, '{"v":1}');
    expect(dailyBackup(file, dir, '2026-10-01', 2)).toBe(path.join(dir, 'league-2026-10-01.json'));
    writeFileSync(file, '{"v":2}');
    // Same day again: the morning copy stays as it was.
    expect(dailyBackup(file, dir, '2026-10-01', 2)).toBeNull();
    expect(readFileSync(path.join(dir, 'league-2026-10-01.json'), 'utf8')).toBe('{"v":1}');
    dailyBackup(file, dir, '2026-10-02', 2);
    writeFileSync(path.join(dir, 'notes.txt'), 'mine');
    dailyBackup(file, dir, '2026-10-03', 2);
    expect(readdirSync(dir).sort()).toEqual(['league-2026-10-02.json', 'league-2026-10-03.json', 'notes.txt']);
  });

  it('does nothing without a league file, and reports errors instead of throwing', () => {
    const root = temp();
    expect(dailyBackup(path.join(root, 'league.json'), path.join(root, 'b'), '2026-10-01', 3)).toBeNull();
    expect(existsSync(path.join(root, 'b'))).toBe(false);
    const file = path.join(root, 'league.json');
    writeFileSync(file, '{}');
    writeFileSync(path.join(root, 'blocked'), 'a file where the folder should be');
    expect(dailyBackup(file, path.join(root, 'blocked'), '2026-10-01', 3)).toBeInstanceOf(Error);
  });
});
