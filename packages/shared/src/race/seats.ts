// Seat rules (GAME_DESIGN §3): a car has a Pilot seat and an Engineer seat; one player may
// instead take the whole car as Solo. A player alone in a car always has every control.

export const SEATS = ['pilot', 'engineer', 'solo'] as const;
export type Seat = (typeof SEATS)[number];

/** What a player actually controls right now. */
export type Role = 'pilot' | 'engineer' | 'solo';

/** The seat-relevant facts about one player. */
export interface SeatedPlayer {
  id: string;
  /** Car slot (0-based), or -1 when not in a car (watching). */
  slot: number;
  seat: Seat | null;
  /** False while the player's connection is gone but their seat is held for them. */
  connected: boolean;
}

/** Car id for a slot. Ids sort in slot order for up to 10 cars ("car0".."car9"). */
export const carIdForSlot = (slot: number): string => `car${slot}`;

/** Everyone sitting in a car slot (other than `exceptId`). */
export function occupants(players: readonly SeatedPlayer[], slot: number, exceptId?: string): SeatedPlayer[] {
  return players.filter((p) => p.id !== exceptId && p.slot === slot && p.seat !== null);
}

/** Why a player may not take a seat, or null when they may. */
export function seatProblem(
  players: readonly SeatedPlayer[],
  playerId: string,
  slot: number,
  seat: Seat,
  maxCars: number,
): string | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= maxCars) return 'there is no such car';
  const others = occupants(players, slot, playerId);
  if (seat === 'solo') return others.length === 0 ? null : 'someone is already in this car';
  if (others.some((o) => o.seat === 'solo')) return 'someone drives this car solo';
  if (others.some((o) => o.seat === seat)) return `the ${seat} seat is taken`;
  return null;
}

/**
 * The role a player plays: their seat, except that a player whose teammate is missing
 * (empty seat or disconnected) drives solo with every control. Null = not in a car.
 */
export function effectiveRole(players: readonly SeatedPlayer[], playerId: string): Role | null {
  const me = players.find((p) => p.id === playerId);
  if (!me || me.seat === null || me.slot < 0) return null;
  if (me.seat === 'solo') return 'solo';
  const mates = occupants(players, me.slot, playerId).filter((p) => p.connected);
  return mates.length === 0 ? 'solo' : me.seat;
}

/** Slots that have at least one seated player (connected or held), ascending. */
export function usedSlots(players: readonly SeatedPlayer[]): number[] {
  return [...new Set(players.filter((p) => p.seat !== null && p.slot >= 0).map((p) => p.slot))].sort((a, b) => a - b);
}

/** First seat a newcomer could take: a free seat next to a lone player first, then an empty car. */
export function suggestSeat(players: readonly SeatedPlayer[], maxCars: number): { slot: number; seat: Seat } | null {
  for (let slot = 0; slot < maxCars; slot++) {
    const occ = occupants(players, slot);
    if (occ.length === 1 && occ[0]!.seat !== 'solo') {
      return { slot, seat: occ[0]!.seat === 'pilot' ? 'engineer' : 'pilot' };
    }
  }
  for (let slot = 0; slot < maxCars; slot++) {
    if (occupants(players, slot).length === 0) return { slot, seat: 'pilot' };
  }
  return null;
}
