// npm run faces: list the face images in assets/faces/ into assets/faces/faces.json.
// Faces are coworker photos (only people who agreed); they stay on this PC (gitignored).
// The game works with none: everyone then gets the drawn placeholder face.
// Faces at different heights? Add "eyes" and "chin" (0 = top of the photo, 1 = bottom) and
// optionally "x" (middle of the face, 0 = left) to an entry in faces.json; re-runs keep them.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {typeof import('../packages/server/src/faces.ts')} */
const faces = await tsImport(pathToFileURL(path.join(ROOT, 'packages', 'server', 'src', 'faces.ts')).href, import.meta.url);

const manifest = faces.writeManifest();
const rel = path.relative(ROOT, path.join(faces.FACES_DIR, 'faces.json'));
if (manifest.faces.length === 0) {
  console.log(`faces: none found — put .png/.jpg/.webp files in assets/faces/ and run again (wrote empty ${rel})`);
} else {
  console.log(`faces: ${manifest.faces.length} → ${rel} (${manifest.faces.map((f) => f.name).join(', ')})`);
}
