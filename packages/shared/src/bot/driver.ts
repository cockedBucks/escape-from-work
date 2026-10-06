import type { Tuning } from '../config/tuning';
import type { Track } from '../track/build';
import type { CarInput, CarState } from '../sim/types';
import { botPedals, type BotMemory } from './engineer';
import { botItem } from './items';
import { botSteer } from './pilot';

/**
 * Both halves of the bot together: the input a solo bot car sends for this tick. `others` =
 * the other cars (for aiming items); without them it never fires an item.
 */
export function botInput(car: CarState, track: Track, cfg: Tuning, memory: BotMemory, others: readonly CarState[] = []): CarInput {
  const item = botItem(car, others, cfg, memory.skill);
  return { steer: botSteer(car, track, cfg, memory.skill), ...botPedals(car, track, cfg, memory), fire: item.fire, aimBack: item.aimBack };
}
