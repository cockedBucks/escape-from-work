import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_TRACK } from '@escape/shared';
import { loadCarsFile, loadTrackFile, loadTuningFile } from '../packages/server/src/config';
import { startServer, type GameServer } from '../packages/server/src/app';
import { startBotCar, type BotCar } from '../packages/client/src/bot/netBot';

/** One lap of the server's track takes about 45 s in real time (the server runs at real speed). */
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
      const track = loadTrackFile(DEFAULT_TRACK, tuning);
      const stats = loadCarsFile().cars[0]!.stats;
      const endpoint = { hostname: '127.0.0.1', port: game!.port, secure: false };
      for (let i = 0; i < 2; i++) cars.push(await startBotCar({ endpoint, tuning, track, stats }));
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
    const track = loadTrackFile(DEFAULT_TRACK, tuning);
    const stats = loadCarsFile().cars[0]!.stats;
    const endpoint = { hostname: '127.0.0.1', port: game!.port, secure: false };
    // Car 1 (slot 0) is taken by the bots above.
    await expect(startBotCar({ endpoint, tuning, track, stats, slot: 0 })).rejects.toThrow(/refused/);
  });
});
