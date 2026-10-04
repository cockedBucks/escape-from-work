// npm run verify: typecheck + all Vitest tests (+ a short headless bot race from P1.4).
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

const typesOnly = process.argv.includes('--types-only');
const started = Date.now();

/** Run a Node script with the same Node binary (works the same on Windows, macOS, Linux). */
function runNode(args) {
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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
  const r = runNode([VITEST, 'run', '--reporter=json', `--outputFile=${VITEST_JSON}`]);
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
  // Bot race joins here in P1.4 (one track, 2 cars, 1 lap, headless).
  const ok = typeFailures.length === 0 && t.failed === 0;
  console.log(`verify: ${ok ? 'OK' : 'FAILED'} — ${typesPart}, ${testsPart}, bot race n/a until P1.4 (${seconds()}s)`);
  if (!ok) process.exitCode = 1;
}
if (typeFailures.length > 0) process.exitCode = 1;
