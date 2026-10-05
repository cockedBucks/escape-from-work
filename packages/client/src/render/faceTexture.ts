import * as THREE from 'three';
import { type FaceFraming, photoPlacement } from './facePlacement';
import { HEAD } from './look';

// Bobblehead textures. A sphere's texture wraps all the way round, so the face goes on the
// part that points forward: centered at u = 0.25 (where three.js puts +Z), half height.
// The rest of the head is a plain light "helmet" color.

const W = HEAD.textureWidth;
const H = W / 2;

/** Where the face sits on the wrap-around texture (+Z = forward). */
const FACE = { cx: W * 0.25, cy: H * 0.5, rx: W * 0.11, ry: H * 0.4 };

function baseCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not available');
  ctx.fillStyle = HEAD.helmetColor;
  ctx.fillRect(0, 0, W, H);
  return { canvas, ctx };
}

/** The drawn placeholder face: a big smile and round glasses (ART_STYLE §4). */
function drawPlaceholder(ctx: CanvasRenderingContext2D): void {
  const { cx, cy, rx, ry } = FACE;
  ctx.fillStyle = HEAD.placeholderSkin;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1e2230';
  ctx.lineWidth = rx * 0.08;
  // glasses
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * rx * 0.42, cy - ry * 0.15, rx * 0.3, ry * 0.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#1e2230';
    ctx.beginPath();
    ctx.arc(cx + side * rx * 0.42, cy - ry * 0.15, rx * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.12, cy - ry * 0.15);
  ctx.lineTo(cx + rx * 0.12, cy - ry * 0.15);
  ctx.stroke();
  // smile
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.2, rx * 0.45, ry * 0.28, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

/** Framing per face file, from the host's faces.json (set before any photo is drawn). */
const framings = new Map<string, FaceFraming>();

export function setFaceFraming(faces: readonly ({ file: string } & FaceFraming)[]): void {
  framings.clear();
  for (const { file, eyes, chin, x } of faces) framings.set(file, { eyes, chin, x });
}

/** Draw a photo into the face oval (eyes and chin on fixed lines, clipped round). */
function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, framing: FaceFraming | undefined): void {
  const { cx, cy, rx, ry } = FACE;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  const p = photoPlacement(img.width, img.height, FACE, framing);
  ctx.drawImage(img, p.x, p.y, p.w, p.h);
  ctx.restore();
}

/**
 * One texture + material per face file ('' = placeholder), shared by every head showing
 * it. A photo loads in the background; until then (or if it fails) the placeholder shows.
 */
export class FaceMaterials {
  private readonly cache = new Map<string, THREE.MeshLambertMaterial>();

  get(face: string): THREE.MeshLambertMaterial {
    let mat = this.cache.get(face);
    if (mat) return mat;
    const { canvas, ctx } = baseCanvas();
    drawPlaceholder(ctx);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshLambertMaterial({ map: tex });
    this.cache.set(face, mat);
    if (face !== '') {
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = HEAD.helmetColor;
        ctx.fillRect(0, 0, W, H);
        drawPhoto(ctx, img, framings.get(face));
        tex.needsUpdate = true;
      };
      img.src = `/faces/${encodeURIComponent(face)}`;
    }
    return mat;
  }

  dispose(): void {
    for (const mat of this.cache.values()) {
      mat.map?.dispose();
      mat.dispose();
    }
    this.cache.clear();
  }
}
