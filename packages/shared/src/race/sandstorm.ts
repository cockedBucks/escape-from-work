import type { TrackDef } from '../config/track';
import type { RacePhase } from './flow';

/**
 * Is the track's sandstorm blowing? Only while racing, and only while the race leader is on the
 * storm lap (the leader has finished `lap - 1` laps), so everyone gets the same lap of fog.
 */
export function sandstormOn(storm: TrackDef['sandstorm'], phase: RacePhase, lapsDone: Iterable<number>): boolean {
  if (!storm || phase !== 'racing') return false;
  let leader = 0;
  for (const n of lapsDone) leader = Math.max(leader, n);
  return leader + 1 === storm.lap;
}
