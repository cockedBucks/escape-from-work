// Server entry. `--prod` (used by `npm start`) serves the built client; otherwise Vite does.
// `--port <n>` overrides `net.port` (0 = any free port; used by `npm run shots`).
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { GAME_TITLE } from '@escape/shared';
import { startServer } from './app';
import { REPO_ROOT, loadTuningFile } from './config';
import { lanUrls } from './lan';
import { dailyBackup } from './league/backup';
import { localIso } from './league/record';
import { LEAGUE_FILE } from './league/store';
import { portFree } from './net/portFree';

const isProd = process.argv.includes('--prod') || process.env['NODE_ENV'] === 'production';
if (isProd) process.env['NODE_ENV'] = 'production';

function portArg(): number | undefined {
  const i = process.argv.indexOf('--port');
  if (i === -1) return undefined;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    console.error('--port needs a number from 0 to 65535');
    process.exit(1);
  }
  return n;
}

const tuning = loadTuningFile();
const requestedPort = portArg() ?? tuning.net.port;
const clientDir = path.join(REPO_ROOT, 'packages', 'client', 'dist');

if (isProd && !existsSync(path.join(clientDir, 'index.html'))) {
  console.error('No built client found (packages/client/dist). Run `npm run build`, or use `npm start`.');
  process.exit(1);
}

const BUSY_PORT = `Port ${requestedPort} is busy. Is the game already running? Or change net.port in config/tuning.json.`;
if (!(await portFree(requestedPort, '0.0.0.0'))) {
  console.error(BUSY_PORT);
  process.exit(1);
}

// The real league (npm start): one safety copy per day in data/backups/, at start and then
// checked every hour (a no-op until the date changes), so a server left running keeps making them.
const BACKUP_CHECK_MS = 60 * 60 * 1000;
function backupLeague(): void {
  const backup = dailyBackup(LEAGUE_FILE, path.join(path.dirname(LEAGUE_FILE), 'backups'), localIso(new Date()).slice(0, 10), tuning.league.backupKeep);
  if (backup instanceof Error) console.warn(`League backup failed (the game still runs): ${backup.message}`);
  else if (backup) console.log(`League backup: ${path.relative(REPO_ROOT, backup)}`);
}
if (isProd && !process.env['EFW_NO_LEAGUE']) {
  backupLeague();
  setInterval(backupLeague, BACKUP_CHECK_MS).unref();
}

let port: number;
try {
  ({ port } = await startServer({
    port: requestedPort,
    host: '0.0.0.0',
    clientDir: isProd ? clientDir : undefined,
    handleSignals: true,
    dev: !isProd,
    watchConfig: !isProd,
    // EFW_NO_LEAGUE=1: tools (shots, jitter) run the real server without the host's league.
    leagueFile: process.env['EFW_NO_LEAGUE'] ? undefined : LEAGUE_FILE,
  }));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(BUSY_PORT); // taken in the moment between the check and the start
    process.exit(1);
  }
  throw err;
}

const [local, ...lan] = lanUrls(port, networkInterfaces());
// scripts/shots.mjs reads the port from "on port <n>" in this line: keep that wording.
console.log(`\n${GAME_TITLE} server (${isProd ? 'production' : 'dev'}) on port ${port}`);
if (isProd) {
  console.log(`  This PC:  ${local}`);
  for (const url of lan) console.log(`  LAN:      ${url}`);
  if (lan.length === 0) console.log('  LAN:      (no network found, only this PC can join)');
} else {
  console.log(`  Game server: ${lan.join(', ') || local}`);
  console.log('  Dev mode: open the page from the Vite "Network" URL below, not this port.');
}
console.log('');
