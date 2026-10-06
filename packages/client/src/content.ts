export { DEFAULT_TRACK } from '@escape/shared';
import { buildTrack, parseCars, parseItems, parseTrack, parseTuning, type CarsConfig, type ItemsConfig, type Track, type Tuning } from '@escape/shared';
import rawCars from '../../../config/cars.json';
import rawItems from '../../../config/items.json';
import rawTuning from '../../../config/tuning.json';

// Config files are bundled into the page at build time (offline, no fetches).
const trackFiles = import.meta.glob<unknown>('../../../config/tracks/*.json', { eager: true, import: 'default' });


// Dev: tuning.json and cars.json changes arrive live from the server (MSG.tuning), so the
// page must not reload for them. Track edits are not accepted here: Vite reloads the page.
if (import.meta.hot) {
  import.meta.hot.accept(['../../../config/tuning.json', '../../../config/cars.json'], () => {});
}

export function loadTuning(): Tuning {
  return parseTuning(rawTuning);
}

export function loadCars(): CarsConfig {
  return parseCars(rawCars);
}

export function loadItems(): ItemsConfig {
  return parseItems(rawItems);
}

export function trackIds(): string[] {
  return Object.keys(trackFiles)
    .map((p) => p.slice(p.lastIndexOf('/') + 1, -'.json'.length))
    .sort();
}

/** Tracks the host may pick in the lobby (not the dev ones), with their names, by id. */
export function pickableTracks(): { id: string; name: string }[] {
  return trackIds()
    .filter((id) => {
      const entry = Object.entries(trackFiles).find(([p]) => p.endsWith(`/${id}.json`));
      return (entry?.[1] as { dev?: unknown } | undefined)?.dev !== true;
    })
    .map((id) => ({ id, name: trackName(id) }));
}

/** A track's display name ("office" → "The Office"); the id itself if unknown. */
export function trackName(id: string): string {
  const entry = Object.entries(trackFiles).find(([p]) => p.endsWith(`/${id}.json`));
  const name = (entry?.[1] as { name?: unknown } | undefined)?.name;
  return typeof name === 'string' ? name : id;
}

/** Validate and build a bundled track. Throws for an unknown id. */
export function loadTrack(id: string, tuning: Tuning): Track {
  const entry = Object.entries(trackFiles).find(([p]) => p.endsWith(`/${id}.json`));
  if (!entry) throw new Error(`unknown track "${id}" (known: ${trackIds().join(', ')})`);
  return buildTrack(parseTrack(entry[1], `config/tracks/${id}.json`), tuning.track);
}
