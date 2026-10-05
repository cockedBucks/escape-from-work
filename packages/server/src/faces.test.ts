import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest, faceExists, isFaceFile, writeManifest } from './faces';

describe('faces', () => {
  it('keeps only image files with safe names, sorted, with display names', () => {
    const m = buildManifest(['README.md', 'zed.PNG', 'omar_hazem.jpg', 'faces.json', '../evil.png', 'dina-k.webp', '.hidden.png']);
    expect(m.faces).toEqual([
      { file: 'dina-k.webp', name: 'dina k' },
      { file: 'omar_hazem.jpg', name: 'omar hazem' },
      { file: 'zed.PNG', name: 'zed' },
    ]);
  });

  it('rejects path tricks', () => {
    expect(isFaceFile('a.png')).toBe(true);
    expect(isFaceFile('../a.png')).toBe(false);
    expect(isFaceFile('a/b.png')).toBe(false);
    expect(isFaceFile('a..png')).toBe(false);
    expect(isFaceFile('a.svg')).toBe(false);
  });

  it('writes faces.json from a folder and checks that a face exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'efw-faces-'));
    try {
      writeFileSync(path.join(dir, 'sara.png'), 'x');
      writeManifest(dir);
      expect(JSON.parse(readFileSync(path.join(dir, 'faces.json'), 'utf8')).faces).toEqual([{ file: 'sara.png', name: 'sara' }]);
      expect(faceExists('sara.png', dir)).toBe(true);
      expect(faceExists('nope.png', dir)).toBe(false);
      expect(faceExists('faces.json', dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an empty or missing folder gives an empty list', () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'efw-faces-')), 'missing');
    expect(writeManifest(dir).faces).toEqual([]);
  });
});
