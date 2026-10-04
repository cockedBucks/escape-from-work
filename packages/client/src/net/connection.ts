import { Client, type EndpointSettings, type Room } from '@colyseus/sdk';
import { ROOM_NAME, parseTuning } from '@escape/shared';
import rawTuning from '../../../../config/tuning.json';

/** What the client reads from the synced room state (decoded by reflection). */
export interface RaceStateView {
  players: { size: number };
}

export interface PageLocation {
  protocol: string;
  hostname: string;
  port: string;
}

/**
 * Where the game server is. Production: the server also serves this page, so same host
 * and port. Dev: Vite serves the page, the game server is on `net.port` of the same host.
 */
export function serverEndpoint(loc: PageLocation, dev: boolean, gamePort: number): EndpointSettings {
  const secure = loc.protocol === 'https:';
  const pagePort = loc.port === '' ? (secure ? 443 : 80) : Number(loc.port);
  return { hostname: loc.hostname, secure, port: dev ? gamePort : pagePort };
}

export function joinRace(): Promise<Room<unknown, RaceStateView>> {
  const tuning = parseTuning(rawTuning);
  const endpoint = serverEndpoint(window.location, import.meta.env.DEV, tuning.net.port);
  return new Client(endpoint).join<RaceStateView>(ROOM_NAME);
}
