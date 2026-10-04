import type { Tuning } from '../config/tuning';
import type { Track } from '../track/build';
import type { CarInput, CarState } from '../sim/types';
import { botPedals, type BotMemory } from './engineer';
import { botSteer } from './pilot';

/** Both halves of the bot together: the input a solo bot car sends for this tick. */
export function botInput(car: CarState, track: Track, cfg: Tuning, memory: BotMemory): CarInput {
  return { steer: botSteer(car, track, cfg.bot), ...botPedals(car, track, cfg, memory) };
}
