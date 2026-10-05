import { HEAD } from './look';

/** Hand-typed framing from faces.json (0..1 of the photo; see packages/server/src/faces.ts). */
export interface FaceFraming {
  eyes?: number;
  chin?: number;
  x?: number;
}

/** The face oval on the head texture, in px. */
export interface Oval {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Keeps the zoom finite for a face drawn right at a photo's edge (framing 0 or 1). */
const EDGE = 0.05;

/**
 * Where to draw a photo (top-left and size, px) so its eyes land on the oval's eye line and,
 * when the photo has room, its chin on the chin line: every face then sits at the same
 * height whatever the photo's framing. A face close to a photo edge is zoomed in rather
 * than moved, so no edge of the photo shows inside the oval.
 */
export function photoPlacement(
  imgW: number,
  imgH: number,
  oval: Oval,
  framing: FaceFraming = {},
): { x: number; y: number; w: number; h: number } {
  const eyes = framing.eyes ?? HEAD.photoEyes;
  const chin = framing.chin ?? HEAD.photoChin;
  const mid = framing.x ?? 0.5;
  const eyeLine = oval.cy + HEAD.ovalEyes * oval.ry;
  const fit = ((HEAD.ovalChin - HEAD.ovalEyes) * oval.ry) / ((chin - eyes) * imgH);
  // Smallest sizes that still cover the oval above/below the eyes and left/right of the middle.
  const coverH = Math.max((eyeLine - (oval.cy - oval.ry)) / Math.max(eyes, EDGE), (oval.cy + oval.ry - eyeLine) / Math.max(1 - eyes, EDGE));
  const coverW = oval.rx / Math.max(Math.min(mid, 1 - mid), EDGE);
  const scale = Math.max(fit, coverH / imgH, coverW / imgW);
  const w = imgW * scale;
  const h = imgH * scale;
  return {
    // The clamps only bite for a face within EDGE of a photo's edge.
    x: clamp(oval.cx - mid * w, oval.cx + oval.rx - w, oval.cx - oval.rx),
    y: clamp(eyeLine - eyes * h, oval.cy + oval.ry - h, oval.cy - oval.ry),
    w,
    h,
  };
}
