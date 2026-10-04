// Server entry. `--prod` (used by `npm start`) serves the built client; otherwise Vite does.
// `--port <n>` overrides `net.port` (0 = any free port; used by `npm run shots`).
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { GAME_TITLE } from '@escape/shared';
import { startServer } from './app';
import { REPO_ROOT, loadTuningFile } from './config';
import { lanUrls } from './lan';

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

let port: number;
try {
  ({ port } = await startServer({
    port: requestedPort,
    host: '0.0.0.0',
    clientDir: isProd ? clientDir : undefined,
    handleSignals: true,
  }));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(`Port ${requestedPort} is busy. Is the game already running? Or change net.port in config/tuning.json.`);
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
