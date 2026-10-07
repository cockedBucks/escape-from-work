// Load test (P3.7): 8 cars, each driven by a Pilot-bot client and an Engineer-bot client
// (16 WebSocket clients), race 3 laps through the real server. Real time: about 2 minutes.
// Run with `npm run test:load` (not part of verify).
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LeagueSchema, MSG, ROOM_NAME } from '@escape/shared';
import { startBotCar, type BotCar } from '../../packages/client/src/bot/netBot';
import { startServer, type GameServer } from '../../packages/server/src/app';
import { loadCarsFile, loadTrackFile, loadTuningFile } from '../../packages/server/src/config';
import { waitForState } from '../helpers';

interface StateView {
  phase?: string;
  host?: string;
  laps?: number;
  tickMsMax?: number;
  tickMsAvg?: number;
  raceTicks?: number;
  tickOverBudget?: number;
  cars?: { size: number; forEach(cb: (c: { finished: boolean; dnf: boolean; place: number; lapsDone: number }, id: string) => void): void };
}

const CARS = 8;
/** One tick must finish inside its 16.7 ms slot (the budget the phase asks for). */
const TICK_BUDGET_MS = 16.7;
/** "Well under": the average tick may use at most this share of the budget… */
const AVG_SHARE = 0.25;
/**
 * …and almost no tick may overrun. This test runs the server AND 17 clients in one Node
 * process, so a rare garbage-collection pause (measured: up to ~18 ms) can land inside a
 * tick; the real server runs alone. Allow one overrun per 1000 ticks, report the max.
 */
const MAX_OVERRUN_SHARE = 0.001;

describe('load: 8 cars, 16 bot clients, 3 laps', () => {
  let game: GameServer | undefined;
  let host: Room<unknown, StateView> | undefined;
  const cars: BotCar[] = [];

  // The race goes into a throwaway league file (never the host's data/league.json).
  const leagueFile = path.join(mkdtempSync(path.join(tmpdir(), 'efw-load-')), 'league.json');

  beforeAll(async () => {
    game = await startServer({ port: 0, host: '127.0.0.1', leagueFile });
  });
  afterAll(async () => {
    await Promise.allSettled(cars.map((c) => c.stop()));
    await host?.leave();
    await game?.close();
  });

  it('every car finishes (or is on its last lap at the window) and the server tick stays fast', async () => {
    const tuning = loadTuningFile();
    const loadTrack = (id: string) => loadTrackFile(id, tuning);
    const roster = loadCarsFile().cars;
    const endpoint = { hostname: '127.0.0.1', port: game!.port, secure: false };

    // A watching host joins first (the first player is host), then the 16 bot clients.
    host = await new Client(endpoint).join<StateView>(ROOM_NAME);
    for (const type of [MSG.events, MSG.tuning, MSG.reload, MSG.lobbyError, MSG.raceRecord]) host.onMessage(type, () => {});
    await waitForState(host, (s) => s.host === host!.sessionId, 'watcher is host');
    // Car 1's clients play people (scored); the rest say they are bots (never scored).
    for (let i = 0; i < CARS; i++) cars.push(await startBotCar({ endpoint, tuning, loadTrack, roster, markBot: i > 0 }));
    await waitForState(host, (s) => s.cars?.size === CARS, `${CARS} cars`);
    expect(host.state.laps).toBe(3);

    const started = Date.now();
    host.send(MSG.hostStart, {});
    await waitForState(host, (s) => s.phase === 'racing', 'race started', 10_000);
    await waitForState(host, (s) => s.phase === 'results', 'race finished', 240_000);

    // With chaos on, a car can fairly miss the finish window (DNF) on its last lap; a car still
    // laps behind means a bot got lost or stuck, which is what this guards.
    let finished = 0;
    let lost = 0;
    host.state.cars!.forEach((c) => {
      if (c.finished) finished++;
      else if (c.lapsDone < host!.state.laps! - 1) lost++;
    });
    const max = host.state.tickMsMax ?? Infinity;
    const avg = host.state.tickMsAvg ?? Infinity;
    const ticks = host.state.raceTicks ?? 0;
    const over = host.state.tickOverBudget ?? Infinity;
    console.log(
      `load: ${CARS} cars / ${CARS * 2} clients, ${finished} finished, ${lost} lost, race ${((Date.now() - started) / 1000).toFixed(0)} s, ` +
        `tick avg ${avg.toFixed(2)} ms, max ${max.toFixed(2)} ms, over budget ${over}/${ticks} (budget ${TICK_BUDGET_MS} ms)`,
    );
    expect(lost).toBe(0);
    expect(finished).toBeGreaterThanOrEqual(CARS / 2);
    expect(avg).toBeLessThan(TICK_BUDGET_MS * AVG_SHARE);
    expect(over).toBeLessThanOrEqual(Math.ceil(ticks * MAX_OVERRUN_SHARE));

    // The league recorded the race: only car 1 has people in it.
    const saved = LeagueSchema.parse(JSON.parse(readFileSync(leagueFile, 'utf8')));
    expect(saved.races).toHaveLength(1);
    const people = saved.races[0]!.cars.filter((c) => !c.bot);
    expect(people.map((c) => c.slot)).toEqual([cars[0]!.slot]);
    expect(people[0]!.players.map((p) => p.seat).sort()).toEqual(['engineer', 'pilot']);
  });
});
