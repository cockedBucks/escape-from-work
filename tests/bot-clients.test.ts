import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCarsFile, loadTrackFile, loadTuningFile } from '../packages/server/src/config';
import { startServer, type GameServer } from '../packages/server/src/app';
import { startBotCar, type BotCar } from '../packages/client/src/bot/netBot';

/** One lap takes about 37 s in real time (the server runs at real speed). */
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
      const track = loadTrackFile('test-loop', tuning);
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
      // Same physics as the headless golden lap (~37 s), plus network delay.
      for (const c of cars) expect(c.lapTimes()[0]).toBeLessThan(60);
    },
    LAP_TIMEOUT_MS + 10_000,
  );
});
