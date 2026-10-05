import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest, faceExists, framingOf, isFaceFile, writeManifest } from './faces';

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

describe('faces with non-English names', () => {
  it('accepts Arabic (any language) file names and keeps them as display names', () => {
    const m = buildManifest(['عمران.jpg', 'كود اوف مقتدى.jpg', 'Zoë.png']);
    expect(m.faces.map((f) => f.file)).toEqual(expect.arrayContaining(['عمران.jpg', 'كود اوف مقتدى.jpg', 'Zoë.png']));
    expect(m.faces.find((f) => f.file === 'عمران.jpg')!.name).toBe('عمران');
  });

  it('still rejects path tricks in any language', () => {
    expect(isFaceFile('عمران/../x.png')).toBe(false);
    expect(isFaceFile('عمران\\x.png')).toBe(false);
    expect(isFaceFile('..عمران.png')).toBe(false);
  });
});

describe('face framing', () => {
  it('npm run faces keeps hand-typed framing, drops bad values and removed files', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'efw-faces-'));
    try {
      writeFileSync(path.join(dir, 'sara.png'), 'x');
      writeFileSync(path.join(dir, 'ali.png'), 'x');
      writeFileSync(
        path.join(dir, 'faces.json'),
        JSON.stringify({ faces: [
          { file: 'sara.png', name: 'sara', eyes: 0.4, chin: 0.9, x: 0.55 },
          { file: 'ali.png', name: 'ali', eyes: 0.9, chin: 0.4, x: 7 },
          { file: 'gone.png', name: 'gone', eyes: 0.3, chin: 0.8 },
        ] }),
      );
      expect(writeManifest(dir).faces).toEqual([
        { file: 'ali.png', name: 'ali' },
        { file: 'sara.png', name: 'sara', eyes: 0.4, chin: 0.9, x: 0.55 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a broken faces.json is replaced, not fatal', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'efw-faces-'));
    try {
      writeFileSync(path.join(dir, 'sara.png'), 'x');
      writeFileSync(path.join(dir, 'faces.json'), '{ oops');
      expect(writeManifest(dir).faces).toEqual([{ file: 'sara.png', name: 'sara' }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('framingOf needs eyes above the chin, all within the photo', () => {
    expect(framingOf({ eyes: 0.4, chin: 0.9 })).toEqual({ eyes: 0.4, chin: 0.9 });
    expect(framingOf({ eyes: 0.4 })).toEqual({});
    expect(framingOf({ eyes: -0.1, chin: 0.9, x: 0.5 })).toEqual({ x: 0.5 });
    expect(framingOf(null)).toEqual({});
  });
});
