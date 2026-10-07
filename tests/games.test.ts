import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client, type EndpointSettings } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_TRACK, MSG, ROOM_NAME, type GameListing } from '@escape/shared';
import { startServer, type GameServer } from '../packages/server/src/app';
import { REPO_ROOT } from '../packages/server/src/config';
import { waitForState } from './helpers';

interface StateView {
  track?: string;
  game?: string;
  mode?: string;
  laps?: number;
  host?: string;
}

// A config copy that allows only one hosted game, to test the cap.
const configDir = mkdtempSync(path.join(tmpdir(), 'efw-games-'));
cpSync(path.join(REPO_ROOT, 'config'), configDir, { recursive: true });
const tuningFile = path.join(configDir, 'tuning.json');
const tuning = JSON.parse(readFileSync(tuningFile, 'utf8')) as { net: { maxGames: number } };
tuning.net.maxGames = 1;
writeFileSync(tuningFile, JSON.stringify(tuning));

const settings = { name: "Dina's game", track: 'server-room', mode: 'battle', laps: 2, bots: true, chaos: true };

describe('hosting and joining games (P12.1, real server)', () => {
  let game: GameServer | undefined;
  let endpoint: EndpointSettings;
  const games = async (): Promise<GameListing[]> =>
    ((await (await fetch(`http://127.0.0.1:${game!.port}/games.json`)).json()) as { games: GameListing[] }).games;
  /** Wait until the listing satisfies `check` (the matchmaker updates a moment after a change). */
  const gamesUntil = async (check: (g: GameListing[]) => boolean): Promise<GameListing[]> => {
    for (let i = 0; i < 50; i++) {
      const list = await games();
      if (check(list)) return list;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`listing never matched: ${JSON.stringify(await games())}`);
  };

  beforeAll(async () => {
    game = await startServer({ port: 0, host: '127.0.0.1', configDir });
    endpoint = { hostname: '127.0.0.1', port: game.port, secure: false };
  });
  afterAll(async () => {
    await game?.close();
    rmSync(configDir, { recursive: true, force: true });
  });

  it('lists the always-open game', async () => {
    const list = await games();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ isDefault: true, track: DEFAULT_TRACK, mode: 'race', phase: 'lobby', players: 0 });
  });

  it('a player hosts a game with their settings; others see it and join it by id; it closes when empty', async () => {
    const host = await new Client(endpoint).create<StateView>(ROOM_NAME, settings);
    host.send(MSG.setName, { name: 'Dina' });
    await waitForState(host, (s) => s.track === 'server-room' && s.game === "Dina's game" && s.mode === 'battle' && s.laps === 2, 'hosted settings');
    const list = await gamesUntil((g) => g.some((x) => !x.isDefault && x.host === 'Dina'));
    const hosted = list.find((g) => !g.isDefault)!;
    expect(hosted).toMatchObject({ name: "Dina's game", track: 'server-room', mode: 'battle', players: 1 });
    // The always-open game is untouched.
    expect(list.find((g) => g.isDefault)?.track).toBe(DEFAULT_TRACK);

    const guest = await new Client(endpoint).joinById<StateView>(hosted.id);
    await waitForState(guest, (s) => s.game === "Dina's game" && s.host === host.sessionId, 'guest is in the hosted game');
    await gamesUntil((g) => g.find((x) => x.id === hosted.id)?.players === 2);

    // Only one hosted game allowed here: a second is refused with a reason.
    await expect(new Client(endpoint).create(ROOM_NAME, { ...settings, name: 'Another' })).rejects.toThrow(/already has 1 games/);

    await guest.leave();
    await host.leave();
    await gamesUntil((g) => !g.some((x) => x.id === hosted.id));
    // Its place is free again.
    const again = await new Client(endpoint).create<StateView>(ROOM_NAME, { ...settings, name: 'Again' });
    await waitForState(again, (s) => s.game === 'Again', 'a new game');
    await again.leave();
  });

  it('refuses bad settings: no name, laps out of range, a dev or unknown track', async () => {
    const create = (over: object) => new Client(endpoint).create(ROOM_NAME, { ...settings, ...over });
    await expect(create({ name: '  ' })).rejects.toThrow(/bad game settings/);
    await expect(create({ laps: 99 })).rejects.toThrow(/laps must be/);
    await expect(create({ track: 'test-loop' })).rejects.toThrow(/no such track/);
    await expect(create({ track: 'nope' })).rejects.toThrow(/no such track/);
  });

  it('a host switching the track changes only their game', async () => {
    const a = await new Client(endpoint).create<StateView>(ROOM_NAME, { ...settings, track: 'office', name: 'Switch' });
    await waitForState(a, (s) => s.host === a.sessionId && s.track === 'office', 'host of the new game');
    a.onMessage(MSG.reload, () => {});
    a.send(MSG.hostTrack, { id: 'motherboard' });
    await waitForState(a, (s) => s.track === 'motherboard', 'switched');
    const list = await gamesUntil((g) => g.some((x) => x.track === 'motherboard'));
    expect(list.find((g) => g.isDefault)?.track).toBe(DEFAULT_TRACK);
    await a.leave();
  });
});
