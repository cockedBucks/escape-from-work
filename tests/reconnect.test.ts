import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client, type EndpointSettings, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MSG, ROOM_NAME } from '@escape/shared';
import { startServer, type GameServer } from '../packages/server/src/app';
import { REPO_ROOT } from '../packages/server/src/config';
import { waitForState } from './helpers';

interface PlayerView {
  slot: number;
  seat: string;
  role: string;
  connected: boolean;
  ackSeq: number;
}
interface StateView {
  players?: { size: number; get(id: string): PlayerView | undefined };
  cars?: { size: number; get(id: string): { x: number } | undefined };
}

/** Short seat-hold window so the timeout case finishes quickly. */
const HOLD_SECONDS = 1;

const configDir = mkdtempSync(path.join(tmpdir(), 'efw-reconnect-'));
cpSync(path.join(REPO_ROOT, 'config'), configDir, { recursive: true });
const tuningFile = path.join(configDir, 'tuning.json');
const tuning = JSON.parse(readFileSync(tuningFile, 'utf8')) as { net: { reconnectSeconds: number } };
tuning.net.reconnectSeconds = HOLD_SECONDS;
writeFileSync(tuningFile, JSON.stringify(tuning, null, 2));

/** A Pilot and an Engineer sharing car 0. */
async function pair(endpoint: EndpointSettings): Promise<[Room<unknown, StateView>, Room<unknown, StateView>]> {
  const a = await new Client(endpoint).join<StateView>(ROOM_NAME);
  const b = await new Client(endpoint).join<StateView>(ROOM_NAME);
  // The SDK would otherwise reconnect by itself; these tests reconnect by hand.
  b.reconnection.enabled = false;
  a.send(MSG.setSeat, { slot: 0, seat: 'pilot' });
  b.send(MSG.setSeat, { slot: 0, seat: 'engineer' });
  await waitForState(a, (s) => s.players?.get(a.sessionId)?.role === 'pilot', 'A is Pilot');
  return [a, b];
}

describe('disconnect and rejoin (real server)', () => {
  let game: GameServer | undefined;
  let endpoint: EndpointSettings;

  beforeAll(async () => {
    game = await startServer({ port: 0, host: '127.0.0.1', configDir });
    endpoint = { hostname: '127.0.0.1', port: game.port, secure: false };
  });
  afterAll(async () => {
    await game?.close();
    rmSync(configDir, { recursive: true, force: true });
  });

  it('a dropped Engineer leaves the Pilot solo; reconnecting restores the seats', async () => {
    const [a, b] = await pair(endpoint);
    const token = b.reconnectionToken;
    const bId = b.sessionId;

    await b.leave(false); // not consented: like a closed tab or Wi-Fi loss
    await waitForState(a, (s) => s.players?.get(bId)?.connected === false, 'B shown as away');
    expect(a.state.players!.get(a.sessionId)!.role).toBe('solo');
    expect(a.state.players!.get(bId)!.seat).toBe('engineer'); // seat held

    const back = await new Client(endpoint).reconnect<StateView>(token);
    expect(back.sessionId).toBe(bId);
    await waitForState(a, (s) => s.players?.get(bId)?.connected === true, 'B back');
    await waitForState(a, (s) => s.players?.get(a.sessionId)?.role === 'pilot', 'A is Pilot again');
    expect(a.state.players!.get(bId)!.role).toBe('engineer');

    await back.leave();
    await a.leave();
  });

  it('a reopened page can drive again (its input numbers restart at 1)', async () => {
    const [a, b] = await pair(endpoint);
    // The old page had sent many inputs (high seq numbers) before the tab closed.
    b.send(MSG.input, { seq: 500, gas: false });
    await waitForState(a, (s) => s.players?.get(b.sessionId)?.ackSeq === 500, 'old page input applied');
    const token = b.reconnectionToken;
    await b.leave(false);
    await waitForState(a, (s) => s.players?.get(b.sessionId)?.connected === false, 'B away');

    const back = await new Client(endpoint).reconnect<StateView>(token);
    await waitForState(a, (s) => s.players?.get(back.sessionId)?.connected === true, 'B back');
    const startX = a.state.cars!.get('car0')!.x;
    back.send(MSG.input, { seq: 1, gas: true }); // a fresh page starts counting at 1
    await waitForState(a, (s) => (s.cars?.get('car0')?.x ?? startX) > startX + 3, 'Engineer drives again after reconnect');

    await back.leave();
    await a.leave();
  });

  it('after the hold window the seat is freed and the Pilot stays solo', async () => {
    const [a, b] = await pair(endpoint);
    const bId = b.sessionId;
    await b.leave(false);
    await waitForState(a, (s) => s.players?.get(bId) === undefined, 'B removed after the window', (HOLD_SECONDS + 4) * 1000);
    expect(a.state.players!.get(a.sessionId)!.role).toBe('solo');
    expect(a.state.cars!.size).toBe(1);
    await a.leave();
  });
});
