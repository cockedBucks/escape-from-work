import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

describe('track picker (P10.0)', () => {
  /** A config with a second real track: a copy of the Office under another id. */
  function twoTracks(): string {
    const dir = tempConfig();
    const office = JSON.parse(readFileSync(path.join(dir, 'tracks', 'office.json'), 'utf8')) as Record<string, unknown>;
    writeFileSync(path.join(dir, 'tracks', 'office-two.json'), JSON.stringify({ ...office, id: 'office-two', name: 'Office Two' }));
    writeFileSync(path.join(dir, 'tracks', 'broken.json'), '{ nope');
    return dir;
  }

  it('offers every valid non-dev track (not the Test Loop, not a broken file)', () => {
    expect(new LiveConfig(twoTracks()).availableTracks()).toEqual(['office', 'office-two']);
  });

  it('switches the track and tells the room; refuses dev, unknown and broken tracks', () => {
    const live = new LiveConfig(twoTracks());
    const heard: ConfigChange[] = [];
    live.subscribe((c) => heard.push(c));
    expect(live.selectTrack('test-loop')).toMatch(/no such track/);
    expect(live.selectTrack('nope')).toMatch(/no such track/);
    expect(live.selectTrack('broken')).toMatch(/no such track/);
    expect(heard).toEqual([]);
    expect(live.selectTrack('office-two')).toBeNull();
    expect(live.trackId).toBe('office-two');
    expect(live.track.def.id).toBe('office-two');
    expect(heard.map((c) => c.kind)).toEqual(['track']);
    expect(live.selectTrack('office-two')).toBeNull(); // already: nothing happens
    expect(heard).toHaveLength(1);
  });
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
