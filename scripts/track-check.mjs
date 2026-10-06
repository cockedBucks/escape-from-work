// npm run track:check -- [track ids...]
// Validates track files (schema + geometry). With no ids, checks every file in config/tracks/.
// Then 2 bots drive 3 laps: they must finish without ever needing a respawn (a stuck spot).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRACKS_DIR = path.join(ROOT, 'config', 'tracks');

/** @type {typeof import('../packages/shared/src/index.ts')} */
const shared = await tsImport(
  pathToFileURL(path.join(ROOT, 'packages', 'shared', 'src', 'index.ts')).href,
  import.meta.url,
);

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const ids =
  requested.length > 0
    ? requested
    : readdirSync(TRACKS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -'.json'.length))
        .sort();

let tuning;
try {
  tuning = shared.parseTuning(readJson(path.join(ROOT, 'config', 'tuning.json')));
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
}

let failed = 0;
for (const id of ids) {
  const rel = path.join('config', 'tracks', `${id}.json`);
  try {
    if (!existsSync(path.join(ROOT, rel))) throw new Error(`no file ${rel}`);
    const def = shared.parseTrack(readJson(path.join(ROOT, rel)), rel.split(path.sep).join('/'));
    if (def.id !== id) throw new Error(`${rel}: "id" is "${def.id}" but the file name says "${id}"`);
    const track = shared.buildTrack(def, tuning.track);
    const { issues, stats } = shared.checkTrack(track, tuning.track.minWidth);
    let summary =
      `${stats.length.toFixed(0)} m, ${stats.samples} samples, ` +
      `width ${stats.minWidth.toFixed(0)}–${stats.maxWidth.toFixed(0)} m, ` +
      `tightest radius ${stats.minRadius.toFixed(1)} m, ${def.zones.length} zones`;
    if (issues.length === 0) {
      const race = shared.runBotRace(track, tuning, { cars: 2, laps: 3, maxSeconds: 3 * 180 });
      const respawns = race.cars.reduce((n, c) => n + c.respawns, 0);
      const laps = race.cars.flatMap((c) => c.lapTimes);
      if (!race.finished) issues.push('bots did not finish 3 laps (stuck or lost)');
      if (respawns > 0) issues.push(`bots needed ${respawns} respawn(s): look for a stuck spot`);
      if (laps.length > 0) {
        summary += `; bot laps ${Math.min(...laps).toFixed(1)}–${Math.max(...laps).toFixed(1)} s`;
      }
    }
    if (issues.length === 0) {
      console.log(`track ${id}: OK — ${summary}`);
    } else {
      failed++;
      console.log(`track ${id}: FAILED — ${summary}`);
      for (const issue of issues) console.log(`  - ${issue}`);
    }
  } catch (err) {
    failed++;
    console.log(`track ${id}: FAILED`);
    console.log(`  ${String(err instanceof Error ? err.message : err).split('\n').join('\n  ')}`);
  }
}

if (failed > 0) process.exitCode = 1;
