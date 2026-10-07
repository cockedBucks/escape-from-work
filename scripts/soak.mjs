// npm run soak -- [--minutes 10] [--cars 8] [--laps 2] [--chaos on|off]
// Soak test (P10.5): the real server in this process, 2 bot clients per car in a child process
// (16 clients for 8 cars), races back to back for N minutes. After every race it records the
// server's heap (after a forced garbage collection, so the numbers are comparable) and the
// race's tick times, then judges: no heap growth, ticks inside the budget, every race finishes.
// Writes artifacts/soak.json. Run with --expose-gc (the npm script does).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@colyseus/sdk';
import { tsImport } from 'tsx/esm/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const minutes = Number(arg('minutes', '10'));
const carCount = Number(arg('cars', '8'));
const laps = Number(arg('laps', '2'));
const chaos = arg('chaos', 'on') === 'on';

/** One tick must fit its 16.7 ms slot; allow 1 overrun per 1000 ticks (GC pauses: clients share the machine). */
const TICK_BUDGET_MS = 16.7;
const MAX_OVERRUN_SHARE = 0.001;
/** Heap may grow at most this much from the first measured race to the last (MB). */
const MAX_HEAP_GROWTH_MB = 8;
/** A race (countdown + laps + finish window) must end within this (ms). */
const RACE_TIMEOUT_MS = 6 * 60_000;

if (typeof globalThis.gc !== 'function') {
  console.error('soak: run with node --expose-gc (use `npm run soak`)');
  process.exit(1);
}
if (!(minutes > 0) || !Number.isInteger(carCount) || carCount < 1 || carCount > 8 || !Number.isInteger(laps) || laps < 1) {
  console.error('usage: npm run soak -- [--minutes 10] [--cars 1-8] [--laps 2] [--chaos on|off]');
  process.exit(1);
}

const load = (rel) => tsImport(pathToFileURL(path.join(ROOT, rel)).href, import.meta.url);
/** @type {typeof import('../packages/shared/src/index.ts')} */
const shared = await load('packages/shared/src/index.ts');
/** @type {typeof import('../packages/server/src/app.ts')} */
const { startServer } = await load('packages/server/src/app.ts');

// Terse output: hide the server's per-join/leave room log lines (one per client, every race).
const log = console.log.bind(console);
console.log = (...a) => { if (!(typeof a[0] === 'string' && a[0].startsWith('[room]'))) log(...a); };

const leagueDir = mkdtempSync(path.join(tmpdir(), 'efw-soak-'));
const game = await startServer({ port: 0, host: '127.0.0.1', leagueFile: path.join(leagueDir, 'league.json') });
const url = `http://127.0.0.1:${game.port}`;

/** Resolve when the room state passes `check` (checked on every patch), or fail after `ms`. */
const waitFor = (room, check, label, ms) => new Promise((resolve, reject) => {
  if (room.state && check(room.state)) return resolve();
  const listener = (s) => { if (check(s)) { clearTimeout(timer); room.onStateChange.remove(listener); resolve(); } };
  const timer = setTimeout(() => { room.onStateChange.remove(listener); reject(new Error(`timed out: ${label}`)); }, ms);
  room.onStateChange(listener);
});

const mb = (bytes) => Math.round((bytes / 1048576) * 10) / 10;
const memory = () => { globalThis.gc(); const m = process.memoryUsage(); return { heapMB: mb(m.heapUsed), rssMB: mb(m.rss) }; };

const races = [];
let bots;
let host;
let failure = null;
try {
  // A watching host joins first (the first player is the host), then the bot clients.
  host = await new Client({ hostname: '127.0.0.1', port: game.port, secure: false }).join(shared.ROOM_NAME);
  for (const type of [shared.MSG.events, shared.MSG.tuning, shared.MSG.reload, shared.MSG.lobbyError, shared.MSG.raceRecord]) host.onMessage(type, () => {});
  await waitFor(host, (s) => s.host === host.sessionId, 'watcher is host', 5000);
  host.send(shared.MSG.hostLaps, { laps });
  host.send(shared.MSG.hostChaos, { on: chaos });
  const seconds = Math.ceil(minutes * 60 + RACE_TIMEOUT_MS / 1000);
  bots = spawn(process.execPath, [path.join(ROOT, 'scripts', 'bots.mjs'), '--cars', String(carCount), '--seconds', String(seconds), '--url', url], { stdio: ['ignore', 'ignore', 'inherit'] });
  await waitFor(host, (s) => s.cars?.size === carCount, `${carCount} cars joined`, 30_000);
  const start = { ...memory(), at: Date.now() };
  console.log(`soak: ${carCount} cars / ${carCount * 2} clients, ${laps} laps per race, chaos ${chaos ? 'on' : 'off'}, ${minutes} min on ${url}; heap at start ${start.heapMB} MB`);

  const until = Date.now() + minutes * 60_000;
  while (Date.now() < until) {
    const t0 = Date.now();
    // Start (or rematch) as soon as the server allows it.
    host.send(shared.MSG.hostStart, {});
    await waitFor(host, (s) => s.phase === 'racing', 'race started', 15_000);
    await waitFor(host, (s) => s.phase === 'results', 'race finished', RACE_TIMEOUT_MS);
    const s = host.state;
    let finished = 0;
    s.cars.forEach((c) => { if (c.finished) finished++; });
    const row = {
      race: races.length + 1, seconds: Math.round((Date.now() - t0) / 1000), finished, cars: s.cars.size, clients: s.players.size,
      tickAvgMs: s.tickMsAvg, tickMaxMs: s.tickMsMax, overBudget: s.tickOverBudget, ticks: s.raceTicks, ...memory(),
    };
    races.push(row);
    console.log(`  race ${row.race}: ${row.seconds} s, ${finished}/${row.cars} finished, tick avg ${row.tickAvgMs.toFixed(2)} ms max ${row.tickMaxMs.toFixed(1)} ms, over ${row.overBudget}/${row.ticks}, heap ${row.heapMB} MB, rss ${row.rssMB} MB, clients ${row.clients}`);
  }
} catch (err) {
  failure = err instanceof Error ? err.message : String(err);
} finally {
  bots?.kill();
  await host?.leave().catch(() => {});
  await game.close();
  rmSync(leagueDir, { recursive: true, force: true });
}

// Verdict. Race 1 warms up (code paths, caches), so heap growth is measured from race 2 on.
const problems = [];
if (failure) problems.push(failure);
if (races.length < 2) problems.push(`only ${races.length} race(s): run longer`);
const first = races[Math.min(1, races.length - 1)];
const last = races[races.length - 1];
const growth = first && last ? Math.round((last.heapMB - first.heapMB) * 10) / 10 : 0;
if (growth > MAX_HEAP_GROWTH_MB) problems.push(`heap grew ${growth} MB (race ${first.race} → ${last.race}), limit ${MAX_HEAP_GROWTH_MB}`);
for (const r of races) {
  if (r.finished < r.cars / 2) problems.push(`race ${r.race}: only ${r.finished}/${r.cars} finished`);
  if (r.overBudget > Math.ceil(r.ticks * MAX_OVERRUN_SHARE)) problems.push(`race ${r.race}: ${r.overBudget} ticks over ${TICK_BUDGET_MS} ms`);
  if (r.clients !== carCount * 2 + 1) problems.push(`race ${r.race}: ${r.clients} clients connected, expected ${carCount * 2 + 1}`);
}
mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
writeFileSync(path.join(ROOT, 'artifacts', 'soak.json'), JSON.stringify({ minutes, cars: carCount, laps, chaos, heapGrowthMB: growth, races, problems }, null, 2));
const ticks = races.map((r) => r.tickMaxMs);
console.log(`soak: ${problems.length === 0 ? 'OK' : 'FAILED'} — ${races.length} races, heap growth ${growth} MB, worst tick ${ticks.length ? Math.max(...ticks).toFixed(1) : '-'} ms -> artifacts/soak.json`);
for (const p of problems) console.log(`  ${p}`);
process.exitCode = problems.length === 0 ? 0 : 1;
// The network client keeps timers alive after leaving.
setTimeout(() => process.exit(process.exitCode), 200);
