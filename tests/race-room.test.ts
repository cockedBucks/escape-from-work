import { Client, type EndpointSettings } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_TRACK, MSG, ROOM_NAME, carIdForSlot, type LobbyError } from '@escape/shared';
import { startServer, type GameServer } from '../packages/server/src/app';
import { waitForState } from './helpers';

interface PlayerView {
  name: string;
  slot: number;
  seat: string;
  role: string;
  ackSeq: number;
  connected: boolean;
}

interface StateView {
  /** Missing until the first full state arrives (join can resolve before it). */
  players?: { size: number; get(id: string): PlayerView | undefined };
  cars?: { get(id: string): { x: number } | undefined; size: number };
  phase?: string;
  host?: string;
  track?: string;
  mode?: string;
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

  it('is the only lobby: a client cannot create a second room', async () => {
    await expect(new Client(endpoint).create(ROOM_NAME)).rejects.toThrow();
    await expect(new Client(endpoint).create(ROOM_NAME, { key: 'guess' })).rejects.toThrow();
  });

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

  it('only the host switches Race ↔ Battle, and everyone sees it (P11.6)', async () => {
    const a = await new Client(endpoint).join<StateView>(ROOM_NAME);
    const b = await new Client(endpoint).join<StateView>(ROOM_NAME);
    await waitForState(a, (s) => s.host === a.sessionId && s.mode === 'race', 'A is host, race mode');
    const byB = new Promise<LobbyError>((resolve) => b.onMessage(MSG.lobbyError, resolve));
    b.send(MSG.hostMode, { mode: 'battle' });
    expect((await byB).reason).toMatch(/only the host/);
    a.send(MSG.hostMode, { mode: 'battle' });
    await waitForState(b, (s) => s.mode === 'battle', 'B sees battle mode');
    a.send(MSG.hostMode, { mode: 'race' });
    await waitForState(b, (s) => s.mode === 'race', 'back to race mode');
    await b.leave();
    await a.leave();
  });

  it('tells everyone the track; only the host may pick one, and only a real one (P10.0)', async () => {
    const a = await new Client(endpoint).join<StateView>(ROOM_NAME);
    const b = await new Client(endpoint).join<StateView>(ROOM_NAME);
    await waitForState(a, (s) => s.host === a.sessionId && s.track === DEFAULT_TRACK, 'A is host, the default track');
    const byB = new Promise<LobbyError>((resolve) => b.onMessage(MSG.lobbyError, resolve));
    b.send(MSG.hostTrack, { id: DEFAULT_TRACK });
    expect((await byB).reason).toMatch(/only the host/);
    const devTrack = new Promise<LobbyError>((resolve) => a.onMessage(MSG.lobbyError, resolve));
    a.send(MSG.hostTrack, { id: 'test-loop' });
    expect((await devTrack).reason).toMatch(/no such track/);
    await b.leave();
    await a.leave();
  });

  it('a track switch: everyone reloads into it, and the host stays host over the reload (P10.7)', async () => {
    const a = await new Client(endpoint).join<StateView>(ROOM_NAME);
    const b = await new Client(endpoint).join<StateView>(ROOM_NAME);
    await waitForState(a, (s) => s.host === a.sessionId && s.track === DEFAULT_TRACK, 'A is host, the default track');
    const reloadOf = (r: typeof a) => new Promise<{ reason?: string }>((resolve) => r.onMessage(MSG.reload, resolve));
    const [ra, rb] = [reloadOf(a), reloadOf(b)];
    a.send(MSG.hostTrack, { id: 'server-room' });
    expect((await ra).reason).toBe('track');
    expect((await rb).reason).toBe('track');
    await waitForState(b, (s) => s.track === 'server-room', 'B sees the new track');

    // A's page reloads (the connection drops, the seat is held); B has not reloaded yet.
    const aId = a.sessionId;
    const token = a.reconnectionToken;
    await a.leave(false);
    await waitForState(b, (s) => s.players?.get(aId)?.connected === false, 'A away');
    expect(b.state.host).toBe(aId);
    const back = await new Client(endpoint).reconnect<StateView>(token);
    await waitForState(back, (s) => s.host === aId && s.track === 'server-room', 'A back as host on the new track');

    // Put the process-wide config back on the default track for the other tests.
    back.send(MSG.hostTrack, { id: DEFAULT_TRACK });
    await waitForState(back, (s) => s.track === DEFAULT_TRACK, 'back on the default track');
    await b.leave();
    await back.leave();
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

describe('head sync (real server)', () => {
  let game: GameServer | undefined;
  let endpoint: EndpointSettings;
  beforeAll(async () => {
    game = await startServer({ port: 0, host: '127.0.0.1' });
    endpoint = { hostname: '127.0.0.1', port: game.port, secure: false };
  });
  afterAll(() => game?.close());

  it('a teammate sees your head angles, clamped to the limits; junk is ignored', async () => {
    const a = await new Client(endpoint).join<{ players?: { get(id: string): { headYaw: number; headPitch: number } | undefined } }>(ROOM_NAME);
    const b = await new Client(endpoint).join<{ players?: { get(id: string): { headYaw: number; headPitch: number } | undefined } }>(ROOM_NAME);
    a.send(MSG.setSeat, { slot: 0, seat: 'pilot' });
    await waitForState(a, (s) => s.players?.get(a.sessionId) !== undefined, 'A is in the room');
    a.send(MSG.head, { yaw: 'left', pitch: 0 });
    a.send(MSG.head, { yaw: 0.5, pitch: 99 });
    await waitForState(b, (s) => (s.players?.get(a.sessionId)?.headYaw ?? 0) > 0.4, 'B sees A look left');
    const head = b.state.players!.get(a.sessionId)!;
    expect(head.headYaw).toBeCloseTo(0.5, 5);
    expect(head.headPitch).toBeLessThan(1); // clamped to camera.headPitchLimit
    await a.leave();
    await b.leave();
  });

  it('watchers (no seat) have no head: their angles are ignored', async () => {
    const a = await new Client(endpoint).join<{ players?: { get(id: string): { headYaw: number } | undefined } }>(ROOM_NAME);
    await waitForState(a, (s) => s.players?.get(a.sessionId) !== undefined, 'A is in the room');
    a.send(MSG.head, { yaw: 0.5, pitch: 0 });
    a.send(MSG.setName, { name: 'Watcher' }); // a later message: once it lands, the head was handled
    await waitForState(a, (s) => (s.players?.get(a.sessionId) as { name?: string } | undefined)?.name === 'Watcher', 'name set');
    expect(a.state.players!.get(a.sessionId)!.headYaw).toBe(0);
    await a.leave();
  });
});

describe('faces (real server)', () => {
  let game: GameServer | undefined;
  let endpoint: EndpointSettings;
  beforeAll(async () => {
    game = await startServer({ port: 0, host: '127.0.0.1' });
    endpoint = { hostname: '127.0.0.1', port: game.port, secure: false };
  });
  afterAll(() => game?.close());

  it('a face that is not on the host is refused; the placeholder is fine', async () => {
    const a = await new Client(endpoint).join<{ players?: { get(id: string): { face: string } | undefined } }>(ROOM_NAME);
    const refused = new Promise<LobbyError>((resolve) => a.onMessage(MSG.lobbyError, resolve));
    a.send(MSG.setFace, { face: 'nobody-has-this-face.png' });
    expect((await refused).reason).toMatch(/not on the host/);
    a.send(MSG.setFace, { face: '' });
    a.send(MSG.setName, { name: 'Placeholder' });
    await waitForState(a, (s) => (s.players?.get(a.sessionId) as { name?: string } | undefined)?.name === 'Placeholder', 'name set');
    expect(a.state.players!.get(a.sessionId)!.face).toBe('');
    await a.leave();
  });

  it('/faces never serves files outside the faces folder, and errors are short', async () => {
    for (const evil of ['..%2fpackage.json', '..%5cpackage.json', '%2e%2e/%2e%2e/package.json', 'nope.png']) {
      const res = await fetch(`http://127.0.0.1:${game!.port}/faces/${evil}`);
      const body = await res.text();
      expect([403, 404]).toContain(res.status);
      expect(body).not.toMatch(/workspaces|escape-from-work|at /);
    }
  });
});
