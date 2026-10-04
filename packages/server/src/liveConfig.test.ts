import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError } from '@escape/shared';
import { REPO_ROOT } from './config';
import { classifyConfigFile } from './dev/configWatcher';
import { LiveConfig, type ConfigChange } from './liveConfig';

const dirs: string[] = [];
function tempConfig(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'efw-config-'));
  cpSync(path.join(REPO_ROOT, 'config'), dir, { recursive: true });
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('LiveConfig', () => {
  it('applies valid tuning and tells listeners', () => {
    const live = new LiveConfig(tempConfig());
    const heard: ConfigChange[] = [];
    live.subscribe((c) => heard.push(c));
    const next = structuredClone(live.tuning);
    next.car.topSpeed = 33;
    live.setTuning(next);
    expect(live.tuning.car.topSpeed).toBe(33);
    expect(heard.map((c) => c.kind)).toEqual(['tuning']);
  });

  it('rejects invalid tuning, keeps the old one and tells nobody', () => {
    const live = new LiveConfig(tempConfig());
    let heard = 0;
    live.subscribe(() => heard++);
    const bad = structuredClone(live.tuning) as unknown as { car: { topSpeed: number } };
    bad.car.topSpeed = -5;
    expect(() => live.setTuning(bad)).toThrow(ConfigError);
    expect(live.tuning.car.topSpeed).toBeGreaterThan(0);
    expect(heard).toBe(0);
  });

  it('saves tuning.json formatted, atomically (no temp file left), and reloads it', () => {
    const dir = tempConfig();
    const live = new LiveConfig(dir);
    const next = structuredClone(live.tuning);
    next.camera.fov = 82;
    live.saveTuning(next);
    const text = readFileSync(path.join(dir, 'tuning.json'), 'utf8');
    expect(text.startsWith('{\n  "car": {\n')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text).camera.fov).toBe(82);
    expect(readdirSync(dir).some((f) => f.includes('.tmp-'))).toBe(false);
    live.setTuning({ ...structuredClone(next), camera: { ...next.camera, fov: 60 } });
    live.reloadTuning();
    expect(live.tuning.camera.fov).toBe(82);
  });

  it('subscribe returns an unsubscribe function', () => {
    const live = new LiveConfig(tempConfig());
    let heard = 0;
    const off = live.subscribe(() => heard++);
    off();
    live.reloadTuning();
    expect(heard).toBe(0);
  });
});

describe('classifyConfigFile', () => {
  it('knows tuning, cars and tracks; ignores the rest', () => {
    expect(classifyConfigFile('tuning.json')).toBe('tuning');
    expect(classifyConfigFile('cars.json')).toBe('cars');
    expect(classifyConfigFile('tracks/test-loop.json')).toBe('track');
    expect(classifyConfigFile('tracks\\test-loop.json')).toBe('track');
    expect(classifyConfigFile('tuning.json.tmp-123')).toBeNull();
    expect(classifyConfigFile('notes.txt')).toBeNull();
    expect(classifyConfigFile('tracks')).toBeNull();
  });
});
