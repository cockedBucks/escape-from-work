import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startServer, type GameServer } from '../packages/server/src/app';

describe('league tables endpoint (P9.4)', () => {
  let game: GameServer | undefined;
  afterEach(async () => {
    await game?.close();
    game = undefined;
  });

  it('serves the tables when the server keeps a league', async () => {
    const leagueFile = path.join(mkdtempSync(path.join(tmpdir(), 'efw-league-http-')), 'league.json');
    game = await startServer({ port: 0, host: '127.0.0.1', leagueFile });
    const res = await fetch(`http://127.0.0.1:${game.port}/league/tables.json`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { enabled: boolean; races: number; week: { start: string; rows: unknown[] } };
    expect(body.enabled).toBe(true);
    expect(body.races).toBe(0);
    expect(body.week.start).toMatch(/^\d{4}-\d\d-\d\d$/);
  });

  it('says "no league" otherwise (tests, tools)', async () => {
    game = await startServer({ port: 0, host: '127.0.0.1' });
    const body = (await (await fetch(`http://127.0.0.1:${game.port}/league/tables.json`)).json()) as { enabled: boolean };
    expect(body.enabled).toBe(false);
  });
});
