import { Client, type EndpointSettings } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MSG, ROOM_NAME, carIdForSlot, type LobbyError } from '@escape/shared';
import { startServer, type GameServer } from '../packages/server/src/app';
import { waitForState } from './helpers';

interface PlayerView {
  name: string;
  slot: number;
  seat: string;
  role: string;
  ackSeq: number;
}

interface StateView {
  /** Missing until the first full state arrives (join can resolve before it). */
  players?: { size: number; get(id: string): PlayerView | undefined };
  cars?: { get(id: string): { x: number } | undefined; size: number };
  phase?: string;
  host?: string;
}

describe('race room (real server, real clients)', () => {
  let game: GameServer | undefined;
  let endpoint: EndpointSettings;

  beforeAll(async () => {
    // Port 0: the OS picks a free port, so tests never clash with a running dev server.
    game = await startServer({ port: 0, host: '127.0.0.1' });
    endpoint = { hostname: '127.0.0.1', port: game.port, secure: false };
  });

  // `?.`: if startup failed, don't hide that error behind a TypeError here.
  afterAll(() => game?.close());

  it('counts 2 players when two join, then 1 when one leaves', async () => {
    const a = await new Client(endpoint).join<StateView>(ROOM_NAME);
    const b = await new Client(endpoint).join<StateView>(ROOM_NAME);

    await waitForState(a, (s) => s.players?.size === 2, 'A sees 2 players');
    await waitForState(b, (s) => s.players?.size === 2, 'B sees 2 players');

    await b.leave();
    await waitForState(a, (s) => s.players?.size === 1, 'A sees 1 player after B leaves');

    await a.leave();
  });

  it('players name themselves, share a car as Pilot + Engineer, and bad seats are refused', async () => {
    const a = await new Client(endpoint).join<StateView>(ROOM_NAME);
    const b = await new Client(endpoint).join<StateView>(ROOM_NAME);
    a.send(MSG.setName, { name: '  Alice  ' });
    a.send(MSG.setSeat, { slot: 1, seat: 'pilot' });
    await waitForState(a, (s) => s.players?.get(a.sessionId)?.role === 'solo', 'A alone in car 1 drives solo');
    expect(a.state.players!.get(a.sessionId)!.name).toBe('Alice');

    const refused = new Promise<LobbyError>((resolve) => b.onMessage(MSG.lobbyError, resolve));
    b.send(MSG.setSeat, { slot: 1, seat: 'pilot' });
    expect((await refused).reason).toMatch(/taken/);

    b.send(MSG.setSeat, { slot: 1, seat: 'engineer' });
    await waitForState(a, (s) => s.players?.get(a.sessionId)?.role === 'pilot', 'A becomes Pilot');
    await waitForState(a, (s) => s.players?.get(b.sessionId)?.role === 'engineer', 'B is Engineer');
    expect(a.state.cars!.size).toBe(1);

    await b.leave();
    await waitForState(a, (s) => s.players?.get(a.sessionId)?.role === 'solo', 'A solo again after B leaves');
    await a.leave();
  });

  it('a seated client holding gas drives its car forward; junk messages are ignored', async () => {
    const room = await new Client(endpoint).join<StateView>(ROOM_NAME);
    room.send(MSG.setSeat, { slot: 0, seat: 'solo' });
    const myX = (s: StateView): number | undefined => s.cars?.get(carIdForSlot(0))?.x;
    await waitForState(room, (s) => myX(s) !== undefined, 'my car appears');
    const startX = myX(room.state)!;

    room.send(MSG.input, { seq: 1, x: 500 }); // a client may never set positions: dropped
    room.send(MSG.input, 'garbage');
    room.send(MSG.input, { seq: 2, gas: true });
    await waitForState(room, (s) => (myX(s) ?? startX) > startX + 5, 'car moved 5 m forward');
    expect(myX(room.state)!).toBeLessThan(100);
    // The server echoes the last input it applied, for the client's input-delay meter.
    await waitForState(room, (s) => s.players?.get(room.sessionId)?.ackSeq === 2, 'input seq 2 echoed');

    await room.leave();
  });

  it('only the host starts the race; the phase goes countdown → racing', async () => {
    const a = await new Client(endpoint).join<StateView>(ROOM_NAME);
    const b = await new Client(endpoint).join<StateView>(ROOM_NAME);
    await waitForState(a, (s) => s.host === a.sessionId, 'A is host');
    a.send(MSG.setSeat, { slot: 2, seat: 'solo' });
    await waitForState(a, (s) => s.cars?.get('car2') !== undefined, 'car 3 exists');

    const refused = new Promise<LobbyError>((resolve) => b.onMessage(MSG.lobbyError, resolve));
    b.send(MSG.hostStart, {});
    expect((await refused).reason).toMatch(/only the host/);

    a.send(MSG.hostStart, {});
    await waitForState(a, (s) => s.phase === 'countdown', 'countdown');
    await waitForState(a, (s) => s.phase === 'racing', 'racing', 8000);
    await b.leave();
    await a.leave();
  });
});
