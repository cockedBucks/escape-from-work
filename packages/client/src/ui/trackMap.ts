// A track's outline as a tiny SVG map (P12.1): the Host window's track cards and the Join
// list. Built from the centerline samples, scaled into a fixed box; cached per track.
import type { Track } from '@escape/shared';

/** The map's box (SVG units) and how many points the outline keeps at most. */
const MAP = { width: 100, height: 64, pad: 6, maxPoints: 90, line: 5, startRadius: 3.5 } as const;

const cache = new Map<string, string>();

/** `<svg>` with the track's outline (start line marked), `class="track-map"`. Pure, cached by track id. */
export function trackMapSvg(track: Track): string {
  const id = track.def.id;
  const hit = cache.get(id);
  if (hit) return hit;
  const pts = track.samples;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of pts) {
    minX = Math.min(minX, s.pos.x);
    maxX = Math.max(maxX, s.pos.x);
    minZ = Math.min(minZ, s.pos.z);
    maxZ = Math.max(maxZ, s.pos.z);
  }
  const scale = Math.min((MAP.width - 2 * MAP.pad) / Math.max(1, maxX - minX), (MAP.height - 2 * MAP.pad) / Math.max(1, maxZ - minZ));
  const offX = (MAP.width - (maxX - minX) * scale) / 2;
  const offY = (MAP.height - (maxZ - minZ) * scale) / 2;
  const at = (x: number, z: number): string => `${(offX + (x - minX) * scale).toFixed(1)} ${(offY + (z - minZ) * scale).toFixed(1)}`;
  const step = Math.max(1, Math.ceil(pts.length / MAP.maxPoints));
  const d: string[] = [];
  for (let i = 0; i < pts.length; i += step) d.push(`${i === 0 ? 'M' : 'L'}${at(pts[i]!.pos.x, pts[i]!.pos.z)}`);
  const start = track.gates[0]?.pos ?? pts[0]!.pos;
  const [sx, sy] = at(start.x, start.z).split(' ');
  const svg =
    `<svg class="track-map" viewBox="0 0 ${MAP.width} ${MAP.height}" aria-hidden="true">` +
    `<path d="${d.join('')}Z" fill="none" stroke="currentColor" stroke-width="${MAP.line}" stroke-linejoin="round"/>` +
    `<circle cx="${sx}" cy="${sy}" r="${MAP.startRadius}" class="track-map-start"/></svg>`;
  cache.set(id, svg);
  return svg;
}
