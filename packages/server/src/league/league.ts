import type { LeagueStore } from './store';

// The league store the room records races into: set by the real server entry only (tests and
// load tests run without one, so they never touch the host's data/league.json).
let current: LeagueStore | null = null;

export function setLeague(store: LeagueStore | null): void {
  current = store;
}

export function league(): LeagueStore | null {
  return current;
}
