import { watch, type FSWatcher } from 'node:fs';
import type { LiveConfig } from '../liveConfig';

export type ConfigFileKind = 'tuning' | 'cars' | 'track';

/** Editors save in bursts (temp file, rename, touch): wait this long for it to settle (ms). */
const SETTLE_MS = 150;

/** Which config a changed file (path relative to `config/`) belongs to; null = ignore it. */
export function classifyConfigFile(rel: string): ConfigFileKind | null {
  const p = rel.split('\\').join('/');
  if (p.includes('.tmp-')) return null; // our own atomic-write temp files
  if (p === 'tuning.json') return 'tuning';
  if (p === 'cars.json') return 'cars';
  if (/^tracks\/[a-z0-9-]+\.json$/.test(p)) return 'track';
  return null;
}

/**
 * Dev only: watch `config/` and hot-reload whatever changed. A bad edit logs one line and
 * keeps the last good config, so a typo never crashes the server.
 */
export function watchConfig(live: LiveConfig): FSWatcher {
  const timers = new Map<ConfigFileKind, NodeJS.Timeout>();
  const reload = (kind: ConfigFileKind): void => {
    try {
      if (kind === 'tuning') live.reloadTuning();
      else if (kind === 'cars') live.reloadCars();
      else live.reloadTrack();
      console.log(`[config] ${kind} reloaded`);
    } catch (err) {
      console.log(`[config] ${kind} NOT reloaded, keeping the last good one: ${String(err instanceof Error ? err.message : err)}`);
    }
  };
  const watcher = watch(live.configDir, { recursive: true }, (_event, filename) => {
    const kind = filename ? classifyConfigFile(filename.toString()) : null;
    if (!kind) return;
    clearTimeout(timers.get(kind));
    timers.set(kind, setTimeout(() => reload(kind), SETTLE_MS));
  });
  watcher.on('close', () => {
    for (const t of timers.values()) clearTimeout(t);
  });
  return watcher;
}
