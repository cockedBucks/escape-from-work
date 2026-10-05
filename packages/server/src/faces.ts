import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './config';

/** Coworker face images live here on the host PC only (gitignored). */
export const FACES_DIR = path.join(REPO_ROOT, 'assets', 'faces');

/**
 * Image files a face may be: letters and digits in any language (Arabic names too), spaces
 * and `_ . -`, then a common web image type. No slashes, so never a path.
 */
const FACE_FILE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} _.-]{0,60}\.(png|jpe?g|webp)$/iu;

export const isFaceFile = (name: string): boolean => FACE_FILE.test(name) && !name.includes('..');

export interface FaceEntry {
  /** File name in assets/faces/. */
  file: string;
  /** Display name: the file name without extension, "_" and "-" as spaces. */
  name: string;
}

/** The manifest for a list of file names: only face images, sorted, with display names. */
export function buildManifest(files: readonly string[]): { faces: FaceEntry[] } {
  const faces = files
    .filter(isFaceFile)
    .sort((a, b) => a.localeCompare(b))
    .map((file) => ({ file, name: file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() }));
  return { faces };
}

/** Write assets/faces/faces.json from what is in the folder (creates the folder if missing). */
export function writeManifest(dir = FACES_DIR): { faces: FaceEntry[] } {
  mkdirSync(dir, { recursive: true });
  const manifest = buildManifest(readdirSync(dir));
  writeFileSync(path.join(dir, 'faces.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

/** Is this a face the server can actually serve? (Players may only pick existing faces.) */
export function faceExists(name: string, dir = FACES_DIR): boolean {
  return isFaceFile(name) && existsSync(path.join(dir, name));
}
