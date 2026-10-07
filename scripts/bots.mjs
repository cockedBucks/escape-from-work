// npm run bots -- [--cars 4] [--seconds 60] [--url http://host:port] [--game "<name or id>"]
// Real bot players: for each car one Pilot-bot and one Engineer-bot client over WebSockets.
// Point it at a running server (`npm run dev` or `npm start`); default URL is this PC on net.port.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const load = (rel) => tsImport(pathToFileURL(path.join(ROOT, rel)).href, import.meta.url);
/** @type {typeof import('../packages/shared/src/index.ts')} */
const shared = await load('packages/shared/src/index.ts');
/** @type {typeof import('../packages/client/src/bot/netBot.ts')} */
const { findGame, startBotCar } = await load('packages/client/src/bot/netBot.ts');

const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
const tuning = shared.parseTuning(readJson('config/tuning.json'));
/** A track by id: the bots drive whichever track the server races (and follow a switch). */
const loadTrack = (id) => shared.buildTrack(shared.parseTrack(readJson(`config/tracks/${id}.json`), id), tuning.track);
const roster = shared.parseCars(readJson('config/cars.json')).cars;

const carCount = Number(arg('cars', '4'));
const seconds = Number(arg('seconds', '60'));
const url = new URL(arg('url', `http://localhost:${tuning.net.port}`));
const endpoint = {
  hostname: url.hostname,
  port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
  secure: url.protocol === 'https:',
};

if (!Number.isInteger(carCount) || carCount < 1 || !(seconds > 0)) {
  console.error('usage: npm run bots -- --cars <1-8> --seconds <n> [--url http://host:port] [--game "<name or id>"]');
  process.exitCode = 1;
} else {
  await run();
}

async function run() {
  // A hosted game by name or id (P12.1); without --game the bots join the always-open game.
  const wanted = arg('game', '');
  const game = wanted ? await findGame(endpoint, wanted) : undefined;
  if (game === null) {
    console.error(`bots: no game called "${wanted}" on ${url.origin} (see the JOIN list)`);
    process.exitCode = 1;
    return;
  }
  const cars = [];
  try {
    for (let i = 0; i < carCount; i++) cars.push(await startBotCar({ endpoint, tuning, loadTrack, roster, game }));
  } catch (err) {
    console.error(`bots: ${String(err instanceof Error ? err.message : err)} (is the server running at ${url.origin}?)`);
    await Promise.allSettled(cars.map((c) => c.stop()));
    process.exitCode = 1;
    return;
  }
  console.log(`bots: ${cars.length} cars (${cars.length * 2} clients) driving ${cars[0]?.track()} on ${url.origin} for ${seconds}s…`);

  const stop = async () => {
    await Promise.allSettled(cars.map((c) => c.stop()));
    for (const c of cars) {
      const times = c.lapTimes().map((t) => t.toFixed(1)).join(', ') || '-';
      console.log(`  car ${c.slot + 1}: ${c.laps()} laps (${times} s)`);
    }
    // Exit explicitly: the network client keeps timers alive after leaving.
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  setTimeout(() => void stop(), seconds * 1000);
}
