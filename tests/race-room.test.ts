import { Client, type EndpointSettings } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { ROOM_NAME } from '@escape/shared';
import { startServer, type GameServer } from '../packages/server/src/app';
import { waitForState } from './helpers';

interface StateView {
  /** Missing until the first full state arrives (join can resolve before it). */
  players?: { size: number };
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
});
