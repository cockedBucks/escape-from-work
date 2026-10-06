// npm run jitter -- [seconds]
// How smoothly is your own car drawn? Builds the client, starts the production server on a
// spare port, opens the game in the installed Chrome, sits solo in car 1, starts a race,
// holds gas while weaving, and records the drawn car and camera on every frame. Prints how
// even the per-frame movement is (1.00 = perfect) and the car-vs-camera wobble.
// See docs/TESTING.md ("Smoothness"). Healthy: under 5% of frames off by > 40%.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 2599;
const SECONDS = Number(process.argv[2] ?? 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'error'], {
  cwd: path.join(ROOT, 'packages', 'client'), stdio: 'inherit',
});
const srv = spawn(process.execPath, ['--import', 'tsx', path.join('packages', 'server', 'src', 'index.ts'), '--prod', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {} await sleep(500); }
  ({ browser } = await launchBrowser());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('button.seat[data-slot="0"][data-seat="solo"]', { timeout: 20000 });
  await page.click('button.seat[data-slot="0"][data-seat="solo"]', { delay: 50 });
  await sleep(500);
  await page.click('button[data-action="start"]', { delay: 50 });
  // Countdown.
  await page.waitForFunction(() => window.__game.focusCar() !== null, null, { timeout: 15000 });
  await sleep(4500);
  await page.keyboard.down('KeyW');
  await sleep(1500); // get up to speed
  // Record every animation frame while weaving.
  await page.evaluate(() => {
    window.__trace = [];
    const loop = (t) => {
      const c = window.__game.focusCar();
      if (c) window.__trace.push([t, c.x, c.z, c.camX, c.camZ, c.speed]);
      window.__traceRaf = requestAnimationFrame(loop);
    };
    window.__traceRaf = requestAnimationFrame(loop);
  });
  const end = Date.now() + SECONDS * 1000;
  let left = true;
  while (Date.now() < end) {
    await page.keyboard.down(left ? 'KeyA' : 'KeyD');
    await sleep(700);
    await page.keyboard.up(left ? 'KeyA' : 'KeyD');
    await sleep(500);
    left = !left;
  }
  const trace = await page.evaluate(() => { cancelAnimationFrame(window.__traceRaf); return window.__trace; });
  const stats = await page.evaluate(() => window.__game.stats());
  const bad = analyze(trace, stats);
  if (bad > 0.05) process.exitCode = 1;
} finally {
  await browser?.close();
  srv.kill();
}

function pct(a, p) { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

function analyze(trace, stats) {
  const dts = [], ratio = [], screen = [];
  for (let i = 2; i < trace.length; i++) {
    const [t0, x0, z0, cx0, cz0] = trace[i - 2];
    const [t1, x1, z1, cx1, cz1] = trace[i - 1];
    const [t2, x2, z2, cx2, cz2, v] = trace[i];
    const dt = (t2 - t1) / 1000;
    dts.push(t2 - t1);
    if (v < 5 || dt <= 0) continue;
    // Drawn world speed this frame vs the car's speed: 1 = smooth.
    ratio.push(Math.hypot(x2 - x1, z2 - z1) / dt / v);
    // On-screen wobble: change of (car - camera) between frames, second difference (m).
    const r0 = [x0 - cx0, z0 - cz0], r1 = [x1 - cx1, z1 - cz1], r2 = [x2 - cx2, z2 - cz2];
    screen.push(Math.hypot(r2[0] - 2 * r1[0] + r0[0], r2[1] - 2 * r1[1] + r0[1]));
  }
  const bad = ratio.filter((r) => r < 0.6 || r > 1.4).length;
  console.log(`frames ${trace.length}, frame ms p50 ${pct(dts, 0.5).toFixed(1)} p95 ${pct(dts, 0.95).toFixed(1)} max ${Math.max(...dts).toFixed(1)}`);
  console.log(`drawn speed / car speed: p5 ${pct(ratio, 0.05).toFixed(2)} p50 ${pct(ratio, 0.5).toFixed(2)} p95 ${pct(ratio, 0.95).toFixed(2)}; frames off by >40%: ${bad} (${((100 * bad) / ratio.length).toFixed(1)}%)`);
  console.log(`car-vs-camera wobble (m, 2nd diff): p50 ${pct(screen, 0.5).toFixed(3)} p95 ${pct(screen, 0.95).toFixed(3)} max ${Math.max(...screen).toFixed(3)}`);
  console.log(`stats: ${JSON.stringify({ fps: stats.fps, ping: stats.pingMs, delay: stats.inputDelayMs, snapAge: stats.snapshotAgeMs })}`);
  return bad / ratio.length;
}
