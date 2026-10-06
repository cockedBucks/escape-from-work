import type { ItemsConfig } from '../config/items';
import type { CarState, SimEvent, World } from '../sim/types';
import { Rng } from '../util/rng';
import type { ChaosState } from './chaos';
import { canBeHit, hitCar } from './effects';
import { racePlaces } from './roll';

// Items that hit another car straight away (no projectile): Blue Screen, Lag Spike, Control
// Swap, Forced Update. All can be blocked by a Firewall. Effects hit the whole car, so both
// of its players feel them.

/** Cars ordered by place (1 = leading) that items may hit right now. */
function standings(world: World, now: number): CarState[] {
  const places = racePlaces(world.cars);
  return [...world.cars].filter((c) => canBeHit(c, now)).sort((a, b) => places.get(a.id)! - places.get(b.id)!);
}

const placeOf = (world: World, car: CarState): number => racePlaces(world.cars).get(car.id) ?? 1;

/** The car directly ahead of `car` in the race (null if it is leading). */
export function carAhead(world: World, car: CarState, now: number): CarState | null {
  const mine = placeOf(world, car);
  const ahead = standings(world, now).filter((c) => c.id !== car.id && placeOf(world, c) < mine);
  return ahead[ahead.length - 1] ?? null;
}

/** The race leader (the next car down if that is you). */
export function leader(world: World, car: CarState, now: number): CarState | null {
  return standings(world, now).find((c) => c.id !== car.id) ?? null;
}

/** A random car ahead of `car`, picked from the top 3 when any of them is ahead. */
export function randomAhead(world: World, chaos: ChaosState, car: CarState, now: number, topN: number): CarState | null {
  const mine = placeOf(world, car);
  const ahead = standings(world, now).filter((c) => c.id !== car.id && placeOf(world, c) < mine);
  if (ahead.length === 0) return null;
  const top = ahead.filter((c) => placeOf(world, c) <= topN);
  const pool = top.length > 0 ? top : ahead;
  const rng = new Rng(chaos.rng);
  const pick = pool[Math.floor(rng.next() * pool.length)]!;
  chaos.rng = rng.state;
  return pick;
}

const ticks = (seconds: number, dt: number): number => Math.round(seconds / dt);

/** Put a timed effect on the target (or let its Firewall take it). */
export function strike(
  target: CarState | null,
  item: 'blueScreen' | 'lagSpike' | 'controlSwap' | 'forcedUpdate',
  by: string,
  cfg: ItemsConfig,
  dt: number,
  events: SimEvent[],
): void {
  if (!target) return;
  hitCar(target, item, by, events, () => {
    const c = cfg.items;
    if (item === 'blueScreen') target.blueScreenTicks = ticks(c.blueScreen.seconds, dt);
    else if (item === 'lagSpike') target.lagTicks = ticks(c.lagSpike.seconds, dt);
    else if (item === 'controlSwap') target.controlSwapTicks = ticks(c.controlSwap.seconds, dt);
    else target.updateTicks = ticks(c.forcedUpdate.maxSeconds, dt);
  });
}
