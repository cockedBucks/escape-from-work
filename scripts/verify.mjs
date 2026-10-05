// npm run verify: typecheck + all Vitest tests + a short headless bot race.
// Terse on purpose: prints only failures (first lines of each) and one summary line.
// `--types-only` runs just the typecheck (used by `npm run typecheck`).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TS_PROJECTS = ['packages/shared', 'packages/server', 'packages/client', 'tests'];
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const VITEST_JSON = path.join(ROOT, 'artifacts', 'verify', 'vitest.json');
const MAX_LINES = 12;
// A hung step (e.g. a test leaving a socket open) must fail, not block verify forever.
const STEP_TIMEOUT_MS = 180_000;

const typesOnly = process.argv.includes('--types-only');
const started = Date.now();

/** Run a Node script with the same Node binary (works the same on Windows, macOS, Linux). */
function runNode(args) {
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: STEP_TIMEOUT_MS,
  });
  const timedOut = r.error?.code === 'ETIMEDOUT';
  const note = timedOut ? `\nTIMED OUT after ${STEP_TIMEOUT_MS / 1000}s (killed)` : '';
  return { status: timedOut ? 1 : r.status, stdout: r.stdout ?? '', stderr: `${r.stderr ?? ''}${note}` };
}

function nonEmptyLines(text) {
  return text.split(/\r?\n/).filter((l) => l.trim() !== '');
}

/** Returns [] or one failure listing each error once (shared errors show up in every project). */
function typecheck() {
  const failedProjects = [];
  const errors = new Set();
  for (const project of TS_PROJECTS) {
    const r = runNode([TSC, '-p', project, '--pretty', 'false']);
    if (r.status !== 0) {
      failedProjects.push(project);
      for (const line of nonEmptyLines(`${r.stdout}${r.stderr}`)) errors.add(line);
    }
  }
  if (failedProjects.length === 0) return [];
  return [{ name: `typecheck (${failedProjects.join(', ')})`, lines: [...errors] }];
}

function tests() {
  rmSync(VITEST_JSON, { force: true });
  mkdirSync(path.dirname(VITEST_JSON), { recursive: true });
  // The load test (project "load") takes minutes: run it with `npm run test:load`, not here.
  const projects = ['shared', 'server', 'client', 'integration'].flatMap((p) => ['--project', p]);
  const r = runNode([VITEST, 'run', ...projects, '--reporter=json', `--outputFile=${VITEST_JSON}`]);
  if (!existsSync(VITEST_JSON)) {
    const lines = nonEmptyLines(`${r.stdout}${r.stderr}`);
    return { passed: 0, failed: 1, failures: [{ name: 'vitest crashed', lines: lines.slice(-MAX_LINES) }] };
  }
  const report = JSON.parse(readFileSync(VITEST_JSON, 'utf8'));
  const failures = [];
  for (const file of report.testResults) {
    const rel = path.relative(ROOT, file.name).replaceAll('\\', '/');
    const failed = file.assertionResults.filter((a) => a.status === 'failed');
    for (const a of failed) {
      failures.push({ name: `${rel} > ${a.fullName}`, lines: nonEmptyLines(a.failureMessages.join('\n')) });
    }
    // A file that fails to load (syntax error, bad import) has no test results of its own.
    if (file.status === 'failed' && failed.length === 0) {
      failures.push({ name: rel, lines: nonEmptyLines(file.message || 'failed to run') });
    }
  }
  if (!report.success && failures.length === 0) {
    failures.push({ name: 'vitest', lines: ['run reported failure (no tests found?)'] });
  }
  return { passed: report.numPassedTests, failed: Math.max(report.numFailedTests, failures.length), failures };
}

function printFailures(failures) {
  for (const f of failures) {
    console.log(`✗ ${f.name}`);
    for (const line of f.lines.slice(0, MAX_LINES)) console.log(`    ${line}`);
    if (f.lines.length > MAX_LINES) console.log(`    … ${f.lines.length - MAX_LINES} more lines`);
  }
}

/** Short headless bot race: 1 track, 2 cars, 1 lap. Proves the sim still drives end to end. */
function botRace() {
  const r = runNode([path.join('scripts', 'bot-race.mjs'), '--track', 'test-loop', '--cars', '2', '--laps', '1', '--json']);
  const last = nonEmptyLines(r.stdout).at(-1) ?? '';
  let s;
  try {
    s = JSON.parse(last);
  } catch {
    printFailures([{ name: 'bot race', lines: nonEmptyLines(`${r.stdout}\n${r.stderr}`) }]);
    return { ok: false, text: 'bot race CRASHED' };
  }
  if (r.status !== 0 || !s.ok) {
    printFailures([{ name: 'bot race', lines: [last] }]);
    return { ok: false, text: 'bot race DID NOT FINISH' };
  }
  return { ok: true, text: `bot race ok (best lap ${s.bestLap}s)` };
}

const typeFailures = typecheck();
printFailures(typeFailures);
const typeErrorCount = typeFailures.reduce((n, f) => n + f.lines.length, 0);
const typesPart = typeFailures.length === 0 ? 'typecheck ok' : `typecheck FAILED (${typeErrorCount} error lines)`;
const seconds = () => ((Date.now() - started) / 1000).toFixed(1);

if (typesOnly) {
  console.log(`${typesPart} (${TS_PROJECTS.length} projects, ${seconds()}s)`);
} else {
  const t = tests();
  printFailures(t.failures);
  const failedFiles = [...new Set(t.failures.map((f) => f.name.split(' > ')[0]))];
  const testsPart =
    t.failed === 0 ? `${t.passed} tests passed` : `${t.passed} passed, ${t.failed} failed (${failedFiles.join(', ')})`;
  const race = botRace();
  const ok = typeFailures.length === 0 && t.failed === 0 && race.ok;
  console.log(`verify: ${ok ? 'OK' : 'FAILED'} — ${typesPart}, ${testsPart}, ${race.text} (${seconds()}s)`);
  if (!ok) process.exitCode = 1;
}
if (typeFailures.length > 0) process.exitCode = 1;
