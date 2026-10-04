// Server entry. `--prod` (used by `npm start`) serves the built client; otherwise Vite does.
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { GAME_TITLE } from '@escape/shared';
import { startServer } from './app';
import { REPO_ROOT, loadTuningFile } from './config';
import { lanUrls } from './lan';

const isProd = process.argv.includes('--prod') || process.env['NODE_ENV'] === 'production';
if (isProd) process.env['NODE_ENV'] = 'production';

const tuning = loadTuningFile();
const port = tuning.net.port;

try {
  await startServer({
    port,
    host: '0.0.0.0',
    clientDir: isProd ? path.join(REPO_ROOT, 'packages', 'client', 'dist') : undefined,
    handleSignals: true,
  });
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(`Port ${port} is busy. Is the game already running? Or change net.port in config/tuning.json.`);
    process.exit(1);
  }
  throw err;
}

const [local, ...lan] = lanUrls(port, networkInterfaces());
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
