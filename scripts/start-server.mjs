// The office start script (start-server.bat / start-server.sh call this; see docs/LAN.md):
// checks Node, installs the packages when they are missing or out of date, then runs
// `npm start` (build the page + start the server, which prints the addresses to open).
// Only Node built-ins here: it runs before anything is installed.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** "1.2.3" → [1, 2, 3]. */
const parts = (v) => v.replace(/^[^\d]*/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
const atLeast = (have, want) => {
  for (let i = 0; i < 3; i++) if ((have[i] ?? 0) !== (want[i] ?? 0)) return (have[i] ?? 0) > (want[i] ?? 0);
  return true;
};

const needNode = String(pkg.engines?.node ?? '').replace(/^>=\s*/, '');
if (needNode && !atLeast(parts(process.versions.node), parts(needNode))) {
  console.error(`Node.js ${process.versions.node} is too old: this game needs ${needNode} or newer.`);
  console.error('Install the current LTS version from https://nodejs.org and run the start script again.');
  process.exit(1);
}

// npm writes node_modules/.package-lock.json on every install; older than package-lock.json
// means someone pulled a new version of the game with changed packages.
const lock = path.join(ROOT, 'package-lock.json');
const installed = path.join(ROOT, 'node_modules', '.package-lock.json');
const needInstall = !existsSync(installed) || statSync(lock).mtimeMs > statSync(installed).mtimeMs;

// shell: true so Windows finds npm.cmd; the arguments are fixed strings.
const npm = (args, stdio = 'inherit') => spawnSync('npm', args, { cwd: ROOT, stdio, shell: true });

console.log('\n=== Escape from Work: starting the game server ===');
if (needInstall) {
  console.log('Installing the game\'s packages (first time or after an update; needs internet once)...');
  const r = npm(['ci', '--no-audit', '--no-fund']);
  if (r.status !== 0) {
    console.error('\nInstalling failed. Check the internet connection (needed only for this step) and try again.');
    process.exit(r.status ?? 1);
  }
}
console.log('Building the page and starting the server (a few seconds)...');
console.log('Other laptops cannot connect? See docs/LAN.md, section 2 (the Windows firewall).');
console.log('Stop the game with Ctrl+C.\n');

const child = spawn('npm', ['start'], { cwd: ROOT, stdio: 'inherit', shell: true });
// Ctrl+C reaches npm too (same console); wait for it to shut down cleanly.
process.on('SIGINT', () => {});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
