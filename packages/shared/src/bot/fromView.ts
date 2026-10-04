import { createCar } from '../sim/car';
import type { CarState, CarStats } from '../sim/types';
import type { Track } from '../track/build';
import { lapProgress, locateOnTrack } from '../track/locate';

/** The synced car fields a networked bot can see (what a player's browser gets). */
export interface CarViewLike {
  x: number;
  z: number;
  y: number;
  yaw: number;
  /** Ground speed (m/s, never negative). */
  speed: number;
  respawning: boolean;
}

/**
 * Rebuild enough of a `CarState` from synced data for the bot halves (`botSteer`,
 * `botPedals`) to work over the network. Speed is assumed to point forward (bots rarely
 * reverse); `hintSegment` keeps the track lookup on the right part of the loop.
 */
export function carStateFromView(id: string, view: CarViewLike, track: Track, stats: CarStats, hintSegment?: number): CarState {
  const car = createCar(id, stats, track);
  car.x = view.x;
  car.z = view.z;
  car.y = view.y;
  car.yaw = view.yaw;
  car.vx = Math.sin(view.yaw) * view.speed;
  car.vz = Math.cos(view.yaw) * view.speed;
  car.respawnAtTick = view.respawning ? 1 : -1;
  const loc = locateOnTrack(track, { x: view.x, z: view.z }, hintSegment);
  car.segment = loc.segment;
  car.progress = lapProgress(track, loc.progress);
  car.lateral = loc.lateral;
  return car;
}
