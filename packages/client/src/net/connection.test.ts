import { describe, expect, it } from 'vitest';
import { serverEndpoint, usableSession } from './connection';

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
