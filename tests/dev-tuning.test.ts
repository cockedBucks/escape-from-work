import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MSG, ROOM_NAME, type Tuning } from '@escape/shared';
import { startServer, type GameServer } from '../packages/server/src/app';
import { REPO_ROOT } from '../packages/server/src/config';

/** Tests change tuning, so they work on a copy of config/ and never touch the real files. */
const configDir = mkdtempSync(path.join(tmpdir(), 'efw-dev-'));
cpSync(path.join(REPO_ROOT, 'config'), configDir, { recursive: true });
const baseTuning = JSON.parse(readFileSync(path.join(configDir, 'tuning.json'), 'utf8')) as Tuning;

const post = (port: number, route: string, body: unknown): Promise<Response> =>
  fetch(`http://127.0.0.1:${port}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('dev tuning endpoints (real server)', () => {
  let game: GameServer | undefined;

  beforeAll(async () => {
    game = await startServer({ port: 0, host: '127.0.0.1', dev: true, configDir });
  });
  afterAll(async () => {
    await game?.close();
    rmSync(configDir, { recursive: true, force: true });
  });

  it('a live change reaches connected clients; Save writes tuning.json; bad data is refused', async () => {
    const room = await new Client({ hostname: '127.0.0.1', port: game!.port, secure: false }).join(ROOM_NAME);
    const received: Tuning[] = [];
    room.onMessage(MSG.tuning, (t: Tuning) => received.push(t));

    const live = structuredClone(baseTuning);
    live.camera.fov = 88;
    const changed = new Promise<void>((resolve) => room.onMessage(MSG.tuning, (t: Tuning) => t.camera.fov === 88 && resolve()));
    expect((await post(game!.port, '/dev/tuning', { tuning: live, save: false })).status).toBe(200);
    await changed;
    // Not saved yet:
    expect(JSON.parse(readFileSync(path.join(configDir, 'tuning.json'), 'utf8')).camera.fov).toBe(baseTuning.camera.fov);

    expect((await post(game!.port, '/dev/tuning', { tuning: live, save: true })).status).toBe(200);
    expect(JSON.parse(readFileSync(path.join(configDir, 'tuning.json'), 'utf8')).camera.fov).toBe(88);

    const bad = structuredClone(live) as unknown as { car: { grip: number } };
    bad.car.grip = -1;
    const res = await post(game!.port, '/dev/tuning', { tuning: bad, save: true });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('car.grip');
    expect(received.length).toBeGreaterThanOrEqual(2); // on join + live change

    await room.leave();
  });
});

describe('dev tuning endpoints are off without dev mode', () => {
  it('returns 404 with dev: true when NODE_ENV=production', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'efw-prod-'));
    cpSync(path.join(REPO_ROOT, 'config'), dir, { recursive: true });
    const before = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const game = await startServer({ port: 0, host: '127.0.0.1', dev: true, configDir: dir });
      try {
        expect((await post(game.port, '/dev/tuning', { tuning: baseTuning, save: true })).status).toBe(404);
      } finally {
        await game.close();
      }
    } finally {
      if (before === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = before;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 404', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'efw-prod-'));
    cpSync(path.join(REPO_ROOT, 'config'), dir, { recursive: true });
    const game = await startServer({ port: 0, host: '127.0.0.1', configDir: dir });
    try {
      expect((await post(game.port, '/dev/tuning', { tuning: baseTuning, save: true })).status).toBe(404);
    } finally {
      await game.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
