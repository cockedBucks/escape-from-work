// Headless bot race on the shared sim (no server, no browser).
// node scripts/bot-race.mjs [--track test-loop] [--cars 2] [--laps 1] [--json]
// Used by `npm run verify` (1 track, 2 cars, 1 lap). --json prints one JSON line for scripts.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const trackId = arg('track', 'test-loop');
const cars = Number(arg('cars', '2'));
const laps = Number(arg('laps', '1'));
const json = process.argv.includes('--json');

/** @type {typeof import('../packages/shared/src/index.ts')} */
const shared = await tsImport(
  pathToFileURL(path.join(ROOT, 'packages', 'shared', 'src', 'index.ts')).href,
  import.meta.url,
);

const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
const trackRel = path.join('config', 'tracks', `${trackId}.json`);
if (!existsSync(path.join(ROOT, trackRel))) {
  console.error(`no file ${trackRel}`);
  process.exit(1);
}

const cfg = shared.parseTuning(readJson(path.join('config', 'tuning.json')));
const track = shared.buildTrack(shared.parseTrack(readJson(trackRel), trackRel), cfg.track);
const started = Date.now();
// Generous time limit: a bot needing 3 minutes per lap is stuck, not slow.
const result = shared.runBotRace(track, cfg, { cars, laps, maxSeconds: laps * 180 });
const ms = Date.now() - started;

const best = Math.min(...result.cars.flatMap((c) => c.lapTimes));
const summary = {
  ok: result.finished,
  track: trackId,
  cars,
  laps,
  raceSeconds: Number(result.seconds.toFixed(2)),
  bestLap: Number.isFinite(best) ? Number(best.toFixed(2)) : null,
  respawns: result.cars.reduce((n, c) => n + c.respawns, 0),
  wallHits: result.cars.reduce((n, c) => n + c.wallHits, 0),
  hash: result.hash,
  ms,
};

if (json) {
  console.log(JSON.stringify(summary));
} else {
  console.log(
    `bot race ${trackId}: ${summary.ok ? 'finished' : 'DID NOT FINISH'} — ${cars} cars, ${laps} laps, ` +
      `${summary.raceSeconds}s race, best lap ${summary.bestLap ?? '-'}s, ${summary.respawns} respawns, ` +
      `${summary.wallHits} wall hits, hash ${summary.hash} (${ms} ms)`,
  );
}
if (!summary.ok) process.exitCode = 1;
