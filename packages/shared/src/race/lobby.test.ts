import { describe, expect, it } from 'vitest';
import teamsJson from '../../../../config/teams.json';
import { defaultTeamName, parseTeams } from '../config/teams';
import { Rng } from '../util/rng';
import { shuffleSeats, teamNameProblem } from './lobby';
import { seatProblem } from './seats';

describe('shuffleSeats', () => {
  it('pairs everyone two per car, odd one out solo', () => {
    const a = shuffleSeats(['a', 'b', 'c', 'd', 'e'], 8, new Rng(1));
    expect(a.length).toBe(5);
    expect(a.map((s) => s.slot)).toEqual([0, 0, 1, 1, 2]);
    expect(a.map((s) => s.seat)).toEqual(['pilot', 'engineer', 'pilot', 'engineer', 'solo']);
    expect(new Set(a.map((s) => s.id))).toEqual(new Set(['a', 'b', 'c', 'd', 'e']));
  });

  it('every assignment is legal under the seat rules', () => {
    const a = shuffleSeats(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 8, new Rng(9));
    const players = a.map((s) => ({ ...s, connected: true }));
    for (const s of a) expect(seatProblem(players, s.id, s.slot, s.seat, 8)).toBeNull();
  });

  it('is random but repeatable with the same seed, whatever the input order', () => {
    const one = shuffleSeats(['a', 'b', 'c', 'd'], 8, new Rng(3));
    const two = shuffleSeats(['d', 'c', 'b', 'a'], 8, new Rng(3));
    expect(two).toEqual(one);
    const others = [4, 5, 6, 7, 8].map((seed) => JSON.stringify(shuffleSeats(['a', 'b', 'c', 'd'], 8, new Rng(seed))));
    expect(new Set(others).size).toBeGreaterThan(1);
  });

  it('players beyond the seats keep watching', () => {
    expect(shuffleSeats(['a', 'b', 'c', 'd', 'e'], 2, new Rng(1)).length).toBe(4);
  });
});

describe('team names', () => {
  const teams = parseTeams(teamsJson);

  it('the config has a name for every car', () => {
    expect(teams.names.length).toBeGreaterThanOrEqual(8);
    expect(defaultTeamName(teams, 0)).toBe('The Blue Screens');
    expect(defaultTeamName(teams, teams.names.length)).toBe('The Blue Screens 2');
  });

  it('only the team or the host may rename', () => {
    const players = [
      { id: 'p', slot: 1, seat: 'pilot' as const, connected: true },
      { id: 'w', slot: -1, seat: null, connected: true },
    ];
    expect(teamNameProblem(players, 'p', 1, 'h')).toBeNull();
    expect(teamNameProblem(players, 'p', 2, 'h')).toMatch(/only the team/);
    expect(teamNameProblem(players, 'w', 1, 'h')).toMatch(/only the team/);
    expect(teamNameProblem(players, 'h', 5, 'h')).toBeNull();
  });
});
