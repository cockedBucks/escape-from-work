import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ConfigError,
  buildTrack,
  parseCars,
  parseTeams,
  parseTrack,
  parseTuning,
  type CarsConfig,
  type TeamsConfig,
  type Track,
  type Tuning,
} from '@escape/shared';

/** Repository root (this file is packages/server/src/config.ts). */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

function readJson(file: string): unknown {
  const text = readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ConfigError(`${path.relative(REPO_ROOT, file)} is not valid JSON: ${String(err)}`);
  }
}

const rel = (file: string): string => path.relative(REPO_ROOT, file).split(path.sep).join('/');

/** Read and validate `config/tuning.json`. Throws `ConfigError` with every problem listed. */
export function loadTuningFile(file = path.join(REPO_ROOT, 'config', 'tuning.json')): Tuning {
  return parseTuning(readJson(file), rel(file));
}

/** Read and validate `config/cars.json`. */
export function loadCarsFile(file = path.join(REPO_ROOT, 'config', 'cars.json')): CarsConfig {
  return parseCars(readJson(file), rel(file));
}

/** Read and validate `config/teams.json` (default team names). */
export function loadTeamsFile(file = path.join(REPO_ROOT, 'config', 'teams.json')): TeamsConfig {
  return parseTeams(readJson(file), rel(file));
}

/** Read, validate and build `config/tracks/<id>.json`. */
export function loadTrackFile(id: string, tuning: Tuning, dir = path.join(REPO_ROOT, 'config', 'tracks')): Track {
  if (!/^[a-z0-9-]+$/.test(id)) throw new ConfigError(`bad track id "${id}"`);
  const file = path.join(dir, `${id}.json`);
  return buildTrack(parseTrack(readJson(file), rel(file)), tuning.track);
}
