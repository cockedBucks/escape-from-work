import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_COUNTS, type RaceRecord } from '@escape/shared';
import { corruptName, LeagueStore } from './store';

const NOW = new Date('2026-10-06T12:30:00.000Z');

function tempFile(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), 'efw-league-')), 'data', 'league.json');
}

const race = (at = '2026-10-06T12:00:00.000Z'): RaceRecord => ({
  at,
  track: 'office',
  laps: 3,
  chaos: true,
  cars: [
    {
      slot: 0, team: 'Ctrl Freaks', car: 'cabbie', bot: false,
      players: [{ name: 'Dina', seat: 'pilot' }, { name: 'Omar', seat: 'engineer' }],
      place: 1, finished: true, dnf: false, finishMs: 130_000, bestLapMs: 42_000, counts: { ...NO_COUNTS, wallHits: 3 },
    },
  ],
  awards: [{ id: 'duck', slot: 0 }],
});

describe('league store', () => {
  it('starts empty on the first run (no file, nothing backed up)', () => {
    const logs: string[] = [];
    const store = new LeagueStore(tempFile(), () => NOW, (m) => logs.push(m));
    expect(store.data.races).toEqual([]);
    expect(store.backedUp).toBeNull();
    expect(logs).toEqual([]);
  });

  it('saves every race atomically (folder made, no temp file left) and loads it back', () => {
    const file = tempFile();
    new LeagueStore(file, () => NOW).addRace(race());
    expect(readdirSync(path.dirname(file))).toEqual(['league.json']);
    const again = new LeagueStore(file, () => NOW);
    expect(again.data.races).toHaveLength(1);
    expect(again.data.races[0]!.cars[0]!.players[1]!.name).toBe('Omar');
    again.addRace(race('2026-10-07T09:00:00.000+03:00'));
    expect(new LeagueStore(file, () => NOW).data.races).toHaveLength(2);
  });

  it('moves a corrupt file aside, says so, and starts a new league instead of crashing', () => {
    const file = tempFile();
    new LeagueStore(file, () => NOW).addRace(race());
    writeFileSync(file, '{"version": 1, "races": [ oops');
    const logs: string[] = [];
    const store = new LeagueStore(file, () => NOW, (m) => logs.push(m));
    expect(store.data.races).toEqual([]);
    expect(store.backedUp).toBe(corruptName(file, NOW));
    expect(readFileSync(store.backedUp!, 'utf8')).toContain('oops');
    expect(existsSync(file)).toBe(false);
    expect(logs.join()).toContain('not valid');
  });

  it('treats valid JSON in the wrong shape (or an unknown version) as corrupt too', () => {
    const file = tempFile();
    new LeagueStore(file, () => NOW).addRace(race());
    writeFileSync(file, JSON.stringify({ version: 99, races: [] }));
    const store = new LeagueStore(file, () => NOW, () => {});
    expect(store.backedUp).not.toBeNull();
    expect(store.data.races).toEqual([]);
  });

  it('refuses a malformed race record (a bug) without touching the file', () => {
    const file = tempFile();
    const store = new LeagueStore(file, () => NOW);
    store.addRace(race());
    const before = readFileSync(file, 'utf8');
    expect(() => store.addRace({ ...race(), at: 'yesterday' })).toThrow();
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('a file it cannot READ is left alone and this run keeps no league (no data loss)', () => {
    const file = tempFile();
    mkdirSync(file, { recursive: true }); // a folder where the file should be: reading fails
    const logs: string[] = [];
    const store = new LeagueStore(file, () => NOW, (m) => logs.push(m));
    expect(store.disabled).toContain('could not read');
    expect(store.backedUp).toBeNull();
    store.addRace(race()); // ignored, no crash
    expect(store.data.races).toEqual([]);
    expect(existsSync(file)).toBe(true);
    expect(logs.join()).toContain('keeps no league');
  });

  it('backup names are safe on every OS', () => {
    expect(path.basename(corruptName('/x/league.json', NOW))).toBe('league.corrupt-2026-10-06T12-30-00-000Z.json');
  });
});
