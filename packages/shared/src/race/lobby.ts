import { Rng } from '../util/rng';
import type { Seat, SeatedPlayer } from './seats';

export interface SeatAssignment {
  id: string;
  slot: number;
  seat: Seat;
}

/**
 * Host's Shuffle: random pairs. Players are shuffled (seeded, so a test can repeat it),
 * then filled two per car — first Pilot, second Engineer; an odd one out drives solo.
 * Players beyond 2 × maxCars stay watching (not in the result).
 */
export function shuffleSeats(playerIds: readonly string[], maxCars: number, rng: Rng): SeatAssignment[] {
  const ids = [...playerIds].sort(); // same input order every time, then shuffle
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
  }
  const seated = ids.slice(0, maxCars * 2);
  return seated.map((id, i) => {
    const slot = Math.floor(i / 2);
    const alone = i % 2 === 0 && i === seated.length - 1;
    return { id, slot, seat: alone ? 'solo' : i % 2 === 0 ? 'pilot' : 'engineer' };
  });
}

/** Who may rename a team: someone sitting in that car, or the host. */
export function teamNameProblem(players: readonly SeatedPlayer[], by: string, slot: number, host: string | null): string | null {
  if (by === host) return null;
  const me = players.find((p) => p.id === by);
  if (!me || me.slot !== slot || me.seat === null) return 'only the team (or the host) can rename it';
  return null;
}
