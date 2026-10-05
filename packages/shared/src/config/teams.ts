import { z } from 'zod';
import { parseConfig } from './parse';

/** Longest team name (the lobby card and the scoreboard must fit it). */
export const TEAM_NAME_MAX_LENGTH = 32;

/** `config/teams.json`: default team names (GAME_DESIGN §3), one per car slot, in slot order. */
export const TeamsSchema = z.strictObject({
  names: z.array(z.string().trim().min(1).max(TEAM_NAME_MAX_LENGTH)).min(1),
});

export type TeamsConfig = z.infer<typeof TeamsSchema>;

export function parseTeams(raw: unknown, source = 'config/teams.json'): TeamsConfig {
  return parseConfig(TeamsSchema, raw, source);
}

/** Default name for a car slot (names repeat with a number if there are more slots than names). */
export function defaultTeamName(teams: TeamsConfig, slot: number): string {
  const name = teams.names[slot % teams.names.length] as string;
  const round = Math.floor(slot / teams.names.length);
  return round === 0 ? name : `${name} ${round + 1}`;
}
