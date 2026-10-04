import { buildTrack, parseCars, parseTrack, parseTuning, type CarsConfig, type Track, type Tuning } from '@escape/shared';
import rawCars from '../../../config/cars.json';
import rawTuning from '../../../config/tuning.json';

// Config files are bundled into the page at build time (offline, no fetches).
const trackFiles = import.meta.glob<unknown>('../../../config/tracks/*.json', { eager: true, import: 'default' });

export const DEFAULT_TRACK = 'test-loop';

export function loadTuning(): Tuning {
  return parseTuning(rawTuning);
}

export function loadCars(): CarsConfig {
  return parseCars(rawCars);
}

export function trackIds(): string[] {
  return Object.keys(trackFiles)
    .map((p) => p.slice(p.lastIndexOf('/') + 1, -'.json'.length))
    .sort();
}

/** Validate and build a bundled track. Throws for an unknown id. */
export function loadTrack(id: string, tuning: Tuning): Track {
  const entry = Object.entries(trackFiles).find(([p]) => p.endsWith(`/${id}.json`));
  if (!entry) throw new Error(`unknown track "${id}" (known: ${trackIds().join(', ')})`);
  return buildTrack(parseTrack(entry[1], `config/tracks/${id}.json`), tuning.track);
}
