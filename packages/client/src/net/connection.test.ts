import { describe, expect, it, vi } from 'vitest';
import type { Room } from '@colyseus/sdk';
import { leaveGame, serverEndpoint, usableSession, type RaceStateView } from './connection';

describe('serverEndpoint', () => {
  it('dev: same hostname, game port (Vite serves the page on another port)', () => {
    const loc = { protocol: 'http:', hostname: '192.168.1.23', port: '5173' };
    expect(serverEndpoint(loc, true, 2567)).toEqual({ hostname: '192.168.1.23', secure: false, port: 2567 });
  });

  it('production: same host and port as the page', () => {
    const loc = { protocol: 'http:', hostname: '10.0.0.5', port: '2567' };
    expect(serverEndpoint(loc, false, 9999)).toEqual({ hostname: '10.0.0.5', secure: false, port: 2567 });
  });

  it('production without an explicit port uses the protocol default', () => {
    expect(serverEndpoint({ protocol: 'http:', hostname: 'host', port: '' }, false, 2567).port).toBe(80);
    expect(serverEndpoint({ protocol: 'https:', hostname: 'host', port: '' }, false, 2567)).toEqual({
      hostname: 'host',
      secure: true,
      port: 443,
    });
  });
});

describe('usableSession', () => {
  it('uses a token only inside the reconnect window', () => {
    const saved = { token: 't1', leftAt: 1_000 };
    expect(usableSession(saved, 1_000 + 29_000, 30)).toBe('t1');
    expect(usableSession(saved, 1_000 + 31_000, 30)).toBeNull();
    expect(usableSession(null, 0, 30)).toBeNull();
    expect(usableSession({ token: 5, leftAt: 0 } as unknown as { token: string; leftAt: number }, 0, 30)).toBeNull();
  });
});

describe('leaveGame (P12.4)', () => {
  /** A room whose leave() never answers (the SDK waits for an onLeave that may never come). */
  const stuckRoom = (isOpen: boolean): { room: Room<unknown, RaceStateView>; left: () => number } => {
    let calls = 0;
    const room = { connection: { isOpen }, leave: () => { calls++; return new Promise<number>(() => {}); } };
    return { room: room as unknown as Room<unknown, RaceStateView>, left: () => calls };
  };

  it('a dropped connection does not wait for a goodbye', async () => {
    const r = stuckRoom(false);
    await expect(leaveGame(r.room)).resolves.toBeUndefined();
    expect(r.left()).toBe(0);
  });

  it('a server that never confirms is given up on after a moment', async () => {
    vi.useFakeTimers();
    try {
      const r = stuckRoom(true);
      const done = leaveGame(r.room);
      expect(r.left()).toBe(1);
      await vi.advanceTimersByTimeAsync(5000);
      await expect(done).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
