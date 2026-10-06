import type { ItemsConfig } from '../config/items';
import type { Track } from '../track/build';
import { Rng } from '../util/rng';
import type { CarState, SimEvent, World } from '../sim/types';
import type { Puddle } from './coffeeSpill';
import type { InputLog } from './controlEffects';
import type { CarHistory } from './ctrlZ';
import type { Envelope } from './replyAll';
import { bucketOf, racePlaces, rollItem } from './roll';

/** One item box ("Mystery Packet") on the road. */
export interface ItemBox {
  x: number;
  z: number;
  /** Gone until this tick (0 = there). */
  respawnAtTick: number;
}

/**
 * Everything chaos mode adds to the world. A world without it (chaos off, most tests) has no
 * boxes and no items. Plain data: hashed and copied like the cars.
 */
export interface ChaosState {
  cfg: ItemsConfig;
  boxes: ItemBox[];
  /** Seeded RNG state for item rolls (`Rng.state`). */
  rng: number;
  /** Flying Reply-All envelopes and Coffee Spill puddles. */
  envelopes: Envelope[];
  puddles: Puddle[];
  /** Ctrl+Z: each car's recent poses, by car id (derived, not hashed). */
  history: Record<string, CarHistory>;
  /** Lag Spike: each car's recent driving inputs, by car id (derived, not hashed). */
  inputLog: Record<string, InputLog>;
  /** Next id for an envelope or puddle (stable keys for clients). */
  nextId: number;
}

/** Item boxes for a track: each `itemRow` zone puts `count` boxes evenly across the road. */
export function buildBoxes(track: Track): ItemBox[] {
  const n = track.samples.length;
  const boxes: ItemBox[] = [];
  for (const zone of track.def.zones) {
    if (zone.type !== 'itemRow') continue;
    const s = track.samples[Math.round(zone.at * n) % n]!;
    for (let i = 0; i < zone.count; i++) {
      const lateral = -s.width / 2 + (s.width * (i + 1)) / (zone.count + 1);
      boxes.push({ x: s.pos.x + s.right.x * lateral, z: s.pos.z + s.right.z * lateral, respawnAtTick: 0 });
    }
  }
  return boxes;
}

/** Turn chaos mode on for a world (boxes from its track). */
export function createChaos(track: Track, cfg: ItemsConfig, seed: number): ChaosState {
  return { cfg, boxes: buildBoxes(track), rng: seed >>> 0, envelopes: [], puddles: [], history: {}, inputLog: {}, nextId: 1 };
}

const canPickUp = (car: CarState): boolean => car.respawnAtTick < 0;

/**
 * Item boxes for one tick, after the cars moved: a car driving through a box breaks it (it
 * comes back after `boxes.respawnSeconds`) and, if its slot is empty, gets an item rolled
 * from its position bucket. Cars are visited in id order, so the RNG draws are deterministic.
 */
export function stepBoxes(world: World, chaos: ChaosState, dt: number, now: number, events: SimEvent[]): void {
  const { cfg } = chaos;
  const r2 = cfg.boxes.radius * cfg.boxes.radius;
  let places: Map<string, number> | null = null;
  const rng = new Rng(chaos.rng);
  for (const car of world.cars) {
    if (!canPickUp(car)) continue;
    for (let b = 0; b < chaos.boxes.length; b++) {
      const box = chaos.boxes[b]!;
      if (box.respawnAtTick > now) continue;
      const dx = car.x - box.x;
      const dz = car.z - box.z;
      if (dx * dx + dz * dz > r2) continue;
      box.respawnAtTick = now + Math.round(cfg.boxes.respawnSeconds / dt);
      let item: string | null = null;
      if (car.item === '') {
        places ??= racePlaces(world.cars);
        const bucket = bucketOf(places.get(car.id) ?? 1, world.cars.length);
        car.item = rollItem(cfg, bucket, rng);
        item = car.item;
      }
      events.push({ type: 'itemBox', car: car.id, box: b, item });
    }
  }
  chaos.rng = rng.state;
}
