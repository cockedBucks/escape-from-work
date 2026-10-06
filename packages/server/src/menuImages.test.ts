import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listMenuImages } from './menuImages';

describe('menu images', () => {
  it('lists image files only, sorted, and nothing when the folder is missing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'efw-menu-'));
    for (const f of ['b party.jpg', 'a-office.png', 'README.md', 'notes.txt', 'مكتب.webp']) writeFileSync(path.join(dir, f), '');
    expect(listMenuImages(dir)).toEqual(['a-office.png', 'b party.jpg', 'مكتب.webp']);
    expect(listMenuImages(path.join(dir, 'nope'))).toEqual([]);
  });
});
