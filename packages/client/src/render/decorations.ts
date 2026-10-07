// Seasonal decorations (P11.3): holiday pieces placed beside every track (alternating sides,
// evenly around the lap, off every road and clear of the track's props) and falling snow.
// Visual only; each page picks the season from its own date and the player's setting.
import * as THREE from 'three';
import { DECOR_KITS, Rng, activeSeason, type DecorKit, type Season, type SeasonsConfig, type Track } from '@escape/shared';
import { DECOR_LOOK, DECOR_SHAPES, PROP_SHAPES, SNOW } from './look';
import { buildShape, clearOfRoads, shapeHalfWidth } from './propKit';

export interface PlacedDecor {
  kit: DecorKit;
  x: number;
  z: number;
  /** Turned to face the road. */
  rot: number;
}

/** The season to decorate with: the setting is 'auto' (today's season, if any), 'off', or a season id. */
export function pickSeason(cfg: SeasonsConfig, setting: string, day: string): Season | null {
  if (setting === 'off') return null;
  return cfg.seasons.find((s) => s.id === setting) ?? activeSeason(cfg, day);
}

/** This computer's local date as "YYYY-MM-DD". */
export function localDay(d = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** What `Game` needs to decorate `track` for `season` (undefined = no season). */
export function decorationsFor(track: Track, cfg: SeasonsConfig, season: Season | null): { placed: PlacedDecor[]; snow: boolean } | undefined {
  return season ? { placed: placeDecorations(track, season.kits, cfg.decorations), snow: season.snow } : undefined;
}

export const decorHalfWidth = (kit: DecorKit): number => shapeHalfWidth(DECOR_SHAPES[kit]) * DECOR_LOOK.scale;

/** One decoration piece as drawn (office scale × `DECOR_LOOK.scale`). */
export function buildDecor(kit: DecorKit): THREE.BufferGeometry {
  const g = buildShape(DECOR_SHAPES[kit]);
  g.scale(DECOR_LOOK.scale, DECOR_LOOK.scale, DECOR_LOOK.scale);
  return g;
}

/** A blocked spot steps out this many more times (by the piece's own width) before trying the other side. */
const STEP_OUTS = 2;

/**
 * Up to `cfg.perTrack` pieces of `kits` (in turn) around the main road: one every
 * lap-length / perTrack, alternating sides, `edgeGap` m beyond the road edge. A spot that
 * touches a road or a track prop steps further out, then tries the other side, then is
 * skipped. Deterministic.
 */
export function placeDecorations(track: Track, kits: readonly DecorKit[], cfg: SeasonsConfig['decorations']): PlacedDecor[] {
  const out: PlacedDecor[] = [];
  if (kits.length === 0) return out;
  const props = track.def.props.map((p) => ({ x: p.x, z: p.z, half: shapeHalfWidth(PROP_SHAPES[p.kit]) }));
  const n = track.samples.length;
  for (let k = 0; k < cfg.perTrack; k++) {
    const s = track.samples[Math.floor(((k + 0.5) / cfg.perTrack) * n) % n]!;
    const kit = kits[k % kits.length]!;
    const half = decorHalfWidth(kit);
    const spots = (k % 2 === 0 ? [1, -1] : [-1, 1]).flatMap((side) =>
      Array.from({ length: STEP_OUTS + 1 }, (_, i) => ({ side, away: s.width / 2 + cfg.edgeGap + half + i * (2 * half + cfg.propGap) })),
    );
    for (const { side, away } of spots) {
      const x = s.pos.x + s.right.x * side * away;
      const z = s.pos.z + s.right.z * side * away;
      const nearProp = props.some((p) => Math.hypot(p.x - x, p.z - z) < p.half + half + cfg.propGap);
      if (nearProp || !clearOfRoads(track, x, z, half)) continue;
      // +Z is the piece's front: face the road (toward -side × right).
      out.push({ kit, x, z, rot: Math.atan2(-side * s.right.x, -side * s.right.z) });
      break;
    }
  }
  return out;
}

/** The pieces as one InstancedMesh per kit, sharing one material (like the track props). */
export function buildDecorations(placed: readonly PlacedDecor[]): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  group.name = 'decorations';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const disposables: { dispose(): void }[] = [material];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  for (const kit of DECOR_KITS) {
    const mine = placed.filter((d) => d.kit === kit);
    if (mine.length === 0) continue;
    const geo = buildDecor(kit);
    const mesh = new THREE.InstancedMesh(geo, material, mine.length);
    mine.forEach((d, i) => mesh.setMatrixAt(i, m.compose(p.set(d.x, 0, d.z), q.setFromAxisAngle(up, d.rot), one)));
    mesh.castShadow = true;
    mesh.name = `decor:${kit}`;
    group.add(mesh);
    disposables.push(geo, mesh);
  }
  return { group, dispose: () => disposables.forEach((d) => d.dispose()) };
}

/** Wrap `v` into [center - half, center + half). */
const wrapAround = (v: number, center: number, half: number): number => center - half + ((((v - center + half) % (2 * half)) + 2 * half) % (2 * half));

/** Falling snow: flakes in a box that follows the camera (one draw call, no allocations per frame). */
export class Snowfall {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly phase: Float32Array;
  private time = 0;

  constructor(particles: 'reduced' | 'normal', seed = 1) {
    const n = particles === 'reduced' ? Math.floor(SNOW.count / 2) : SNOW.count;
    const rng = new Rng(seed);
    this.pos = new Float32Array(n * 3);
    this.phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = rng.range(-SNOW.halfSize, SNOW.halfSize);
      this.pos[i * 3 + 1] = rng.range(0, SNOW.height);
      this.pos[i * 3 + 2] = rng.range(-SNOW.halfSize, SNOW.halfSize);
      this.phase[i] = rng.range(0, Math.PI * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: SNOW.size, sizeAttenuation: true }));
    this.points.frustumCulled = false; // the flakes follow the camera; the bounding box would be stale
    this.points.name = 'snow';
  }

  /** Let the flakes fall for `dt` s and keep them around the camera at (cx, cz). */
  update(dt: number, cx: number, cz: number): void {
    this.time += dt;
    const p = this.pos;
    for (let i = 0; i < this.phase.length; i++) {
      const sway = Math.sin(this.time + this.phase[i]!) * SNOW.drift * dt;
      p[i * 3] = wrapAround(p[i * 3]! + sway, cx, SNOW.halfSize);
      const y = p[i * 3 + 1]! - SNOW.fall * dt;
      p[i * 3 + 1] = y < 0 ? y + SNOW.height : y;
      p[i * 3 + 2] = wrapAround(p[i * 3 + 2]!, cz, SNOW.halfSize);
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points.removeFromParent();
  }
}
