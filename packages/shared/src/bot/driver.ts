import type { Tuning } from '../config/tuning';
import type { Track } from '../track/build';
import type { CarInput, CarState } from '../sim/types';
import { botPedals, type BotMemory } from './engineer';
import { botItem } from './items';
import { botDrift, botSteer } from './pilot';
import { botRoute } from './route';

/**
 * Both halves of the bot together: the input a solo bot car sends for this tick. `others` =
 * the other cars (for aiming items); without them it never fires an item.
 */
export function botInput(car: CarState, track: Track, cfg: Tuning, memory: BotMemory, others: readonly CarState[] = []): CarInput {
  const item = botItem(car, others, cfg, memory.skill);
  const route = botRoute(car, track, cfg, memory.skill);
  const steer = botSteer(car, track, cfg, route);
  return {
    steer,
    drift: botDrift(car, track, cfg, steer, memory.skill, route),
    ...botPedals(car, track, cfg, memory, route),
    fire: item.fire,
    aimBack: item.aimBack,
  };
}
