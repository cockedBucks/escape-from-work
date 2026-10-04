import { Client, type EndpointSettings } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MSG, ROOM_NAME } from '@escape/shared';
import { startServer, type GameServer } from '../packages/server/src/app';
import { waitForState } from './helpers';

interface StateView {
  /** Missing until the first full state arrives (join can resolve before it). */
  players?: { size: number };
  cars?: { get(id: string): { x: number } | undefined };
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

  it('a client holding gas drives its car forward; junk messages are ignored', async () => {
    const room = await new Client(endpoint).join<StateView>(ROOM_NAME);
    const myX = (s: StateView): number | undefined => s.cars?.get(room.sessionId)?.x;
    await waitForState(room, (s) => myX(s) !== undefined, 'my car appears');
    const startX = myX(room.state)!;

    room.send(MSG.input, { seq: 1, x: 500 }); // a client may never set positions: dropped
    room.send(MSG.input, 'garbage');
    room.send(MSG.input, { seq: 2, gas: true });
    await waitForState(room, (s) => (myX(s) ?? startX) > startX + 5, 'car moved 5 m forward');
    expect(myX(room.state)!).toBeLessThan(100);

    await room.leave();
  });
});
