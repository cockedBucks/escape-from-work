import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './config';
import { isFaceFile } from './faces';

/** Company images for the main menu slideshow (host PC only, gitignored). */
export const MENU_DIR = path.join(REPO_ROOT, 'assets', 'menu');

/**
 * The slideshow list, read when the page asks (so new images show up without a command).
 * Same safe file names as faces: letters/digits in any language, spaces, `_ . -`, png/jpg/webp.
 */
export function listMenuImages(dir = MENU_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => isFaceFile(f) && statSync(path.join(dir, f)).isFile())
    .sort((a, b) => a.localeCompare(b));
}
