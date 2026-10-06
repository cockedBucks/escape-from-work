import type { Tuning } from '../config/tuning';
import { gridSpot } from '../race/grid';
import type { SectorGate, Track } from '../track/build';
import { lapProgress, locateOnTrack } from '../track/locate';
import { right } from '../util/math';
import type { CarState, CarStats, World } from './types';

/** Put a car on a sector gate, stopped and facing along the track, `lateral` m to the right. */
export function placeAtGate(state: CarState, track: Track, gate: SectorGate, lateral = 0): void {
  const r = right(gate.yaw);
  state.x = gate.pos.x + r.x * lateral;
  state.z = gate.pos.z + r.z * lateral;
  state.y = 0;
  state.vy = 0;
  state.yaw = gate.yaw;
  state.vx = 0;
  state.vz = 0;
  state.steer = 0;
  state.lastGate = gate.index;
  state.onSlick = false;
  state.onRamp = false;
  const loc = locateOnTrack(track, { x: state.x, z: state.z }, gate.sample);
  state.segment = loc.segment;
  state.progress = lapProgress(track, loc.progress);
  state.lateral = loc.lateral;
}

/** A new car standing on a gate (default: the start line). */
export function createCar(id: string, stats: CarStats, track: Track, gateIndex = 0, lateral = 0): CarState {
  const gate = track.gates[gateIndex];
  if (!gate) throw new Error(`createCar: track has no gate ${gateIndex}`);
  const state: CarState = {
    id,
    stats: { ...stats },
    x: 0,
    z: 0,
    y: 0,
    vy: 0,
    yaw: 0,
    vx: 0,
    vz: 0,
    steer: 0,
    segment: 0,
    progress: 0,
    lateral: 0,
    lastGate: 0,
    onSlick: false,
    onRamp: false,
    respawnAtTick: -1,
    ghostUntilTick: 0,
    heat: 0,
    stallUntilTick: -1,
    driftDir: 0,
    driftCharge: 0,
    driftLevel: 0,
    straightTicks: 0,
    brakeTicks: 0,
    boostTicks: 0,
    nitro: 0,
    nitroOn: false,
    lap: 1,
    onSwap: false,
    swappedLap: 0,
    solo: false,
    item: '',
    nextHonkTick: 0,
  };
  placeAtGate(state, track, gate, lateral);
  return state;
}

/** A new car on starting grid position `index` (0 = pole), stopped, facing along the track. */
export function createCarOnGrid(id: string, stats: CarStats, track: Track, index: number, race: Tuning['race']): CarState {
  const state = createCar(id, stats, track);
  const spot = gridSpot(track, index, race);
  state.x = spot.pos.x;
  state.z = spot.pos.z;
  state.yaw = spot.yaw;
  const loc = locateOnTrack(track, spot.pos, spot.sample);
  state.segment = loc.segment;
  state.progress = lapProgress(track, loc.progress);
  state.lateral = loc.lateral;
  return state;
}

export function createWorld(track: Track, cars: CarState[]): World {
  const sorted = [...cars].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.id === sorted[i - 1]!.id) throw new Error(`createWorld: duplicate car id ${sorted[i]!.id}`);
  }
  return { tick: 0, track, cars: sorted };
}
