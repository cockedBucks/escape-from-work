import { Client } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_TRACK, MSG, ROOM_NAME } from '@escape/shared';
import { loadCarsFile, loadTrackFile, loadTuningFile } from '../packages/server/src/config';
import { startServer, type GameServer } from '../packages/server/src/app';
import { findGame, startBotCar, type BotCar } from '../packages/client/src/bot/netBot';
import { waitForState } from './helpers';

/** One lap of the default track takes about 45 s in real time (the server runs at real speed). */
const LAP_TIMEOUT_MS = 90_000;

describe('networked bots (real server, 2 cars x 2 clients)', () => {
  let game: GameServer | undefined;
  const cars: BotCar[] = [];

  beforeAll(async () => {
    game = await startServer({ port: 0, host: '127.0.0.1' });
  });
  afterAll(async () => {
    await Promise.allSettled(cars.map((c) => c.stop()));
    await game?.close();
  });

  it(
    'Pilot and Engineer bots on separate connections finish a lap in both cars',
    async () => {
      const tuning = loadTuningFile();
      const loadTrack = (id: string) => loadTrackFile(id, tuning);
      const roster = loadCarsFile().cars;
      const endpoint = { hostname: '127.0.0.1', port: game!.port, secure: false };
      for (let i = 0; i < 2; i++) cars.push(await startBotCar({ endpoint, tuning, loadTrack, roster }));
      expect(cars.map((c) => c.slot)).toEqual([0, 1]);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`laps after timeout: ${cars.map((c) => c.laps()).join(', ')}`)), LAP_TIMEOUT_MS);
        const poll = setInterval(() => {
          if (cars.every((c) => c.laps() >= 1)) {
            clearInterval(poll);
            clearTimeout(timer);
            resolve();
          }
        }, 250);
      });
      // No wall-clock lap-time limit here (it would flake on a busy laptop); lap times are
      // guarded by the headless golden test. This proves split control works end to end.
      for (const c of cars) expect(c.lapTimes().length).toBeGreaterThanOrEqual(1);
    },
    LAP_TIMEOUT_MS + 10_000,
  );

  it('a bot that cannot get its seat fails loudly instead of driving from nowhere', async () => {
    const tuning = loadTuningFile();
    const loadTrack = (id: string) => loadTrackFile(id, tuning);
    const roster = loadCarsFile().cars;
    const endpoint = { hostname: '127.0.0.1', port: game!.port, secure: false };
    // Car 1 (slot 0) is taken by the bots above.
    await expect(startBotCar({ endpoint, tuning, loadTrack, roster, slot: 0 })).rejects.toThrow(/refused/);
  });
});

describe('networked bots follow the track the server races', () => {
  let game: GameServer | undefined;

  beforeAll(async () => {
    game = await startServer({ port: 0, host: '127.0.0.1' });
  });
  afterAll(async () => {
    await game?.close();
  });

  it('drive the host\'s pick, and switch with it', async () => {
    const tuning = loadTuningFile();
    const roster = loadCarsFile().cars;
    const loaded: string[] = [];
    const loadTrack = (id: string) => {
      loaded.push(id);
      return loadTrackFile(id, tuning);
    };
    const endpoint = { hostname: '127.0.0.1', port: game!.port, secure: false };
    // A person joins first (host) and picks another track before the bots come.
    const host = await new Client(endpoint).join<{ host?: string; track?: string }>(ROOM_NAME);
    host.onMessage(MSG.reload, () => {});
    await waitForState(host, (s) => s.host === host.sessionId, 'host');
    host.send(MSG.hostTrack, { id: 'server-room' });
    await waitForState(host, (s) => s.track === 'server-room', 'server-room');

    const car = await startBotCar({ endpoint, tuning, loadTrack, roster });
    try {
      expect(car.track()).toBe('server-room');
      expect(loaded).toEqual(['server-room']);
      // The host switches back in the lobby: pages reload, the bot clients stay and follow.
      host.send(MSG.hostTrack, { id: DEFAULT_TRACK });
      await waitForState(host, (s) => s.track === DEFAULT_TRACK, 'back on the default track');
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`bot still on ${car.track()}`)), 5000);
        const poll = setInterval(() => {
          if (car.track() !== DEFAULT_TRACK) return;
          clearInterval(poll);
          clearTimeout(timer);
          resolve();
        }, 50);
      });
      expect(loaded).toEqual(['server-room', DEFAULT_TRACK]);
    } finally {
      await car.stop();
      await host.leave();
    }
  });

  it('both bots of a car sit in the game asked for: a hosted one by name (P12.4)', async () => {
    const tuning = loadTuningFile();
    const loadTrack = (id: string) => loadTrackFile(id, tuning);
    const roster = loadCarsFile().cars;
    const endpoint = { hostname: '127.0.0.1', port: game!.port, secure: false };
    const host = await new Client(endpoint).create(ROOM_NAME, { name: 'Bot Cup', track: DEFAULT_TRACK, mode: 'race', laps: tuning.race.defaultLaps, bots: false, chaos: true });
    host.onMessage(MSG.reload, () => {});
    const id = await findGame(endpoint, 'Bot Cup');
    expect(id).toBe(host.roomId);
    expect(await findGame(endpoint, 'No Such Game')).toBeNull();
    const car = await startBotCar({ endpoint, tuning, loadTrack, roster, game: id! });
    try {
      const res = (await (await fetch(`http://127.0.0.1:${game!.port}/games.json`)).json()) as { games: { id: string; players: number }[] };
      expect(res.games.find((g) => g.id === host.roomId)?.players).toBe(3); // the host and both bots
    } finally {
      await car.stop();
      await host.leave();
    }
  });
});
