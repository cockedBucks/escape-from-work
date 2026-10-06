import type { ItemId } from '../config/items';
import type { Tuning } from '../config/tuning';
import type { CarInput, CarState, SimEvent, World } from '../sim/types';
import type { ChaosState } from './chaos';
import { dropCoffee } from './coffeeSpill';
import { rewindCar } from './ctrlZ';
import { fireReplyAll } from './replyAll';
import { carAhead, leader, randomAhead, strike } from './targeted';

/** What an item's `use` gets: the world, chaos state, the user's car and its input this tick. */
export interface ItemUse {
  world: World;
  chaos: ChaosState;
  car: CarState;
  input: CarInput;
  cfg: Tuning;
  now: number;
  events: SimEvent[];
}

/** One item: what happens the moment its holder uses it (lasting effects step elsewhere). */
export interface ItemDef {
  id: ItemId;
  use(u: ItemUse): void;
}

/** Every item by id (GAME_DESIGN §7). One file per item; numbers in config/items.json. */
export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  replyAll: { id: 'replyAll', use: (u) => fireReplyAll(u.chaos, u.car, u.input.aimBack ?? false, u.cfg.sim.dt, u.now) },
  firewall: { id: 'firewall', use: (u) => void (u.car.shieldTicks = Math.round(u.chaos.cfg.items.firewall.seconds / u.cfg.sim.dt)) },
  coffeeSpill: { id: 'coffeeSpill', use: (u) => dropCoffee(u.chaos, u.car, u.cfg.sim.dt, u.now) },
  ctrlZ: { id: 'ctrlZ', use: (u) => rewindCar(u.chaos, u.car, u.cfg, u.now) },
  blueScreen: { id: 'blueScreen', use: (u) => strike(carAhead(u.world, u.car, u.now), 'blueScreen', u.car.id, u.chaos.cfg, u.cfg.sim.dt, u.events) },
  lagSpike: { id: 'lagSpike', use: (u) => strike(carAhead(u.world, u.car, u.now), 'lagSpike', u.car.id, u.chaos.cfg, u.cfg.sim.dt, u.events) },
  controlSwap: { id: 'controlSwap', use: (u) => strike(leader(u.world, u.car, u.now), 'controlSwap', u.car.id, u.chaos.cfg, u.cfg.sim.dt, u.events) },
  forcedUpdate: {
    id: 'forcedUpdate',
    use: (u) =>
      strike(randomAhead(u.world, u.chaos, u.car, u.now, u.chaos.cfg.items.forcedUpdate.preferTop), 'forcedUpdate', u.car.id, u.chaos.cfg, u.cfg.sim.dt, u.events),
  },
};

/**
 * Items used this tick, before the cars move: a car pressing fire with an item in its slot
 * uses it (not while respawning or spinning out). Cars in id order (deterministic).
 */
export function useItems(world: World, chaos: ChaosState, inputs: Readonly<Record<string, CarInput | undefined>>, cfg: Tuning, now: number, events: SimEvent[]): void {
  for (const car of world.cars) {
    const input = inputs[car.id];
    // Spinning out you can't use items, except Ctrl+Z, which undoes the spin.
    if (!input?.fire || car.item === '' || car.respawnAtTick >= 0 || (car.spinTicks > 0 && car.item !== 'ctrlZ')) continue;
    const def = ITEMS[car.item as ItemId];
    const item = car.item;
    car.item = '';
    if (!def) continue;
    def.use({ world, chaos, car, input, cfg, now, events });
    events.push({ type: 'itemUse', car: car.id, item });
  }
}
