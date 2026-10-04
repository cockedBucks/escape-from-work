import { describe, expect, it } from 'vitest';
import { serverEndpoint } from './connection';

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
