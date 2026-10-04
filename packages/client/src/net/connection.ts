import { Client, type EndpointSettings, type Room } from '@colyseus/sdk';
import { ROOM_NAME, type Tuning } from '@escape/shared';
import type { CarSource } from '../game';
import { SnapshotBuffer, type CarSnap } from './snapshots';

/** One synced car as decoded by the SDK (see packages/server/src/schema/RaceState.ts). */
export interface CarViewState {
  x: number;
  z: number;
  y: number;
  yaw: number;
  speed: number;
  steer: number;
  progress: number;
  respawning: boolean;
  ghost: boolean;
}

/** What the client reads from the synced room state (decoded by reflection). */
export interface RaceStateView {
  players: { size: number };
  cars: { forEach(cb: (car: CarViewState, id: string) => void): void; size: number };
  tick: number;
  tickMs: number;
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

export function joinRace(tuning: Tuning): Promise<Room<unknown, RaceStateView>> {
  const endpoint = serverEndpoint(window.location, import.meta.env.DEV, tuning.net.port);
  return new Client(endpoint).join<RaceStateView>(ROOM_NAME);
}

/**
 * Cars from the server: every state patch becomes a snapshot stamped with the arrival
 * time, and the game draws `net.interpDelayMs` in the past, blending between snapshots.
 */
export class ServerCarSource implements CarSource {
  private readonly buffer = new SnapshotBuffer();

  constructor(private readonly interpDelayMs: number) {}

  /** Call on every state change. */
  push(now: number, state: RaceStateView): void {
    const cars = new Map<string, CarSnap>();
    state.cars.forEach((c, id) => {
      cars.set(id, { x: c.x, y: c.y, z: c.z, yaw: c.yaw, speed: c.speed, steer: c.steer, respawning: c.respawning, ghost: c.ghost });
    });
    this.buffer.push(now, cars);
  }

  sample(now: number, out: Map<string, CarSnap>): void {
    this.buffer.sample(now - this.interpDelayMs, out);
  }
}
