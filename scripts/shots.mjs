// npm run shots -- <scenario ...> [--track <id>] [--quality low|medium|high] [--gl default|swiftshader|angle|headed]
// Builds the client, starts the production server on a free port, opens each
// `?scenario=` page in the installed Chrome (or Edge), waits for `window.__game.ready`,
// and writes artifacts/shots/<scenario>.png (<scenario>-<track>.png with --track) + stats.json.
// See docs/TESTING.md "Shots". Terse output: one line per scenario + a summary.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser as launchAny } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'artifacts', 'shots');
const VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const SERVER_ENTRY = path.join('packages', 'server', 'src', 'index.ts');
const VIEWPORT = { width: 1280, height: 720 };
const SEED = 1;
const SERVER_START_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 20_000;

// WebGL fallbacks from docs/TESTING.md, tried by hand in this order if WebGL fails headless.
const GL_MODES = {
  default: { headless: true, args: [] },
  swiftshader: { headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  angle: { headless: true, args: ['--use-gl=angle'] },
  headed: { headless: false, args: [] },
};

function parseArgs(argv) {
  const scenarios = [];
  let gl = 'default';
  let track = null;
  let quality = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--gl') gl = argv[++i] ?? '';
    else if (argv[i] === '--track') track = argv[++i] ?? null;
    else if (argv[i] === '--quality') quality = argv[++i] ?? null;
    else scenarios.push(argv[i]);
  }
  return { scenarios, gl, track, quality };
}

function tail(text, n = 12) {
  return text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(-n).join('\n');
}

function buildClient() {
  const r = spawnSync(process.execPath, [VITE, 'build', '--logLevel', 'error'], {
    cwd: path.join(ROOT, 'packages', 'client'),
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`client build failed:\n${tail(`${r.stdout}${r.stderr}`)}`);
}

/** Start the real server entry with `--port 0` and read back the port it bound. */
function startServer() {
  const child = spawn(process.execPath, ['--import', 'tsx', SERVER_ENTRY, '--prod', '--port', '0'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${tail(output)}`)), SERVER_START_TIMEOUT_MS);
    const onData = (chunk) => {
      output += chunk;
      const m = /on port (\d+)/.exec(output);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    };
    child.stdout.setEncoding('utf8').on('data', onData);
    child.stderr.setEncoding('utf8').on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (code ${code}):\n${tail(output)}`));
    });
  });
  return { child, port };
}

function launchBrowser(mode) {
  return launchAny({ headless: mode.headless, args: mode.args });
}

async function shoot(browser, port, scenario, track, quality) {
  const name = [scenario, track, quality].filter(Boolean).join('-');
  const page = await browser.newPage({ viewport: VIEWPORT });
  const consoleErrors = [];
  page.on('console', (msg) => {
    // "Failed to load resource" has no URL; the response listener reports those with one.
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('response', (res) => {
    if (res.status() >= 400) consoleErrors.push(`HTTP ${res.status()} ${res.url()}`);
  });
  try {
    const trackParam = (track ? `&track=${encodeURIComponent(track)}` : '') + (quality ? `&quality=${encodeURIComponent(quality)}` : '');
    await page.goto(`http://localhost:${port}/?scenario=${encodeURIComponent(scenario)}&seed=${SEED}${trackParam}`);
    await page.waitForFunction(() => window.__game && (window.__game.ready || window.__game.error !== null), null, {
      timeout: READY_TIMEOUT_MS,
    });
    const error = await page.evaluate(() => window.__game.error);
    const file = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file });
    const stats = await page.evaluate(() => window.__game.stats());
    return { scenario: name, ok: error === null, error, file, stats, consoleErrors };
  } catch (err) {
    return { scenario: name, ok: false, error: String(err).split('\n')[0], file: null, stats: null, consoleErrors };
  } finally {
    await page.close();
  }
}

async function main() {
  const { scenarios, gl, track, quality } = parseArgs(process.argv.slice(2));
  const mode = GL_MODES[gl];
  if (scenarios.length === 0 || !mode) {
    console.log(`usage: npm run shots -- <scenario ...> [--track <id>] [--quality low|medium|high] [--gl ${Object.keys(GL_MODES).join('|')}]`);
    process.exitCode = 2;
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  buildClient();

  const server = startServer();
  let browser;
  try {
    const port = await server.port;
    const launched = await launchBrowser(mode);
    browser = launched.browser;

    const results = [];
    for (const scenario of scenarios) results.push(await shoot(browser, port, scenario, track, quality));

    const report = {
      browser: `${launched.channel} ${browser.version()}`,
      gl,
      viewport: VIEWPORT,
      scenarios: Object.fromEntries(
        results.map((r) => [r.scenario, { ok: r.ok, error: r.error, stats: r.stats, consoleErrors: r.consoleErrors }]),
      ),
    };
    writeFileSync(path.join(OUT_DIR, 'stats.json'), `${JSON.stringify(report, null, 2)}\n`);

    for (const r of results) {
      const rel = r.file ? path.relative(ROOT, r.file).replaceAll('\\', '/') : '-';
      const s = r.stats;
      const nums = s ? `fps ${s.fps}, draws ${s.drawCalls}, tris ${s.triangles}, ping ${s.pingMs === null ? '-' : `${s.pingMs}ms`}` : '';
      console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.scenario}: ${r.ok ? rel : r.error} ${nums}`.trimEnd());
      for (const e of r.consoleErrors.slice(0, 3)) console.log(`     console error: ${e}`);
    }
    const failed = results.filter((r) => !r.ok).length;
    console.log(`shots: ${results.length - failed}/${results.length} ok (${report.browser}, gl ${gl}) -> artifacts/shots/`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

main().catch((err) => {
  console.error(`shots: FAILED - ${err.message}`);
  process.exitCode = 1;
});
