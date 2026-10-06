import { ITEM_IDS, type ItemId, type ItemsConfig, type RollBucket } from '../config/items';
import type { CarState } from '../sim/types';
import type { Rng } from '../util/rng';

/**
 * How far round the race a car is, for item rolls: laps plus lap progress. A car still behind
 * the start line on lap 1 (progress near 1 before passing gate 1) counts as just before 0.
 */
export function lapDistance(car: CarState): number {
  const behindLine = car.lastGate === 0 && car.progress > 0.5;
  return car.lap + (behindLine ? car.progress - 1 : car.progress);
}

/** Place (1 = leading) of every car by race distance; ties keep id order. */
export function racePlaces(cars: readonly CarState[]): Map<string, number> {
  const order = [...cars].sort((a, b) => lapDistance(b) - lapDistance(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Map(order.map((c, i) => [c.id, i + 1]));
}

/**
 * Position bucket for rubber-banding (GAME_DESIGN §7): front = top 25%, back = bottom 25%
 * (at least one car each once there are two), mid = the rest. A lone car is mid.
 */
export function bucketOf(place: number, cars: number): RollBucket {
  if (cars <= 1) return 'mid';
  const k = Math.max(1, Math.round(cars / 4));
  if (place <= k) return 'front';
  if (place > cars - k) return 'back';
  return 'mid';
}

/** Draw one item from a bucket's weights (they sum to 100) with the seeded RNG. */
export function rollItem(cfg: ItemsConfig, bucket: RollBucket, rng: Rng): ItemId {
  const weights = cfg.roll[bucket];
  let r = rng.next() * 100;
  for (const id of ITEM_IDS) {
    r -= weights[id];
    if (r < 0) return id;
  }
  // Rounding at the very top: the last item with any weight.
  return [...ITEM_IDS].reverse().find((id) => weights[id] > 0) ?? ITEM_IDS[0];
}
