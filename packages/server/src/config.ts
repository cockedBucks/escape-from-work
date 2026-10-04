import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigError, parseTuning, type Tuning } from '@escape/shared';

/** Repository root (this file is packages/server/src/config.ts). */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

function readJson(file: string): unknown {
  const text = readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ConfigError(`${path.relative(REPO_ROOT, file)} is not valid JSON: ${String(err)}`);
  }
}

/** Read and validate `config/tuning.json`. Throws `ConfigError` with every problem listed. */
export function loadTuningFile(file = path.join(REPO_ROOT, 'config', 'tuning.json')): Tuning {
  return parseTuning(readJson(file), path.relative(REPO_ROOT, file));
}
