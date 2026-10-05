import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
  /**
   * Optional framing, typed by hand into faces.json and kept by `npm run faces`. Heights are
   * 0 = top of the photo, 1 = bottom: `eyes` = the eye line, `chin` = the chin. `x` = the
   * middle of the face, 0 = left, 1 = right. Every head then shows its face the same size and
   * height (photos are framed differently).
   */
  eyes?: number;
  chin?: number;
  x?: number;
}

type Framing = Pick<FaceEntry, 'eyes' | 'chin' | 'x'>;

const unit = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1;

/** The valid framing fields of one hand-edited entry (eyes must be above the chin). */
export function framingOf(entry: unknown): Framing {
  if (typeof entry !== 'object' || entry === null) return {};
  const e = entry as Record<string, unknown>;
  const out: Framing = {};
  if (unit(e.eyes) && unit(e.chin) && e.eyes < e.chin) {
    out.eyes = e.eyes;
    out.chin = e.chin;
  }
  if (unit(e.x)) out.x = e.x;
  return out;
}

/** The manifest for a list of file names: only face images, sorted, with display names. */
export function buildManifest(files: readonly string[], framing: ReadonlyMap<string, Framing> = new Map()): { faces: FaceEntry[] } {
  const faces = files
    .filter(isFaceFile)
    .sort((a, b) => a.localeCompare(b))
    .map((file) => ({ file, name: file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(), ...framing.get(file) }));
  return { faces };
}

/** Framing already typed into an existing faces.json (empty if missing or broken). */
function readFraming(manifestPath: string): Map<string, Framing> {
  const out = new Map<string, Framing>();
  try {
    const old = JSON.parse(readFileSync(manifestPath, 'utf8')) as { faces?: unknown };
    if (!Array.isArray(old.faces)) return out;
    for (const entry of old.faces as unknown[]) {
      const file = (entry as { file?: unknown } | null)?.file;
      if (typeof file === 'string') out.set(file, framingOf(entry));
    }
  } catch {
    // no manifest yet, or hand-edited into invalid JSON: start fresh
  }
  return out;
}

/**
 * Write assets/faces/faces.json from what is in the folder (creates the folder if missing),
 * keeping any framing already typed in for files that are still there.
 */
export function writeManifest(dir = FACES_DIR): { faces: FaceEntry[] } {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'faces.json');
  const manifest = buildManifest(readdirSync(dir), readFraming(file));
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

/** Is this a face the server can actually serve? (Players may only pick existing faces.) */
export function faceExists(name: string, dir = FACES_DIR): boolean {
  return isFaceFile(name) && existsSync(path.join(dir, name));
}
