import { insideOtherRoad, locateOnTrack, type DecorKit, type PropKit, type Track } from '@escape/shared';
import { describe, expect, it } from 'vitest';
import { loadSeasons, loadTrack, loadTuning, trackIds } from '../content';
import { propsShowroom } from '../scenarios';
import { buildProp, shapeHalfWidth } from './propKit';
import { buildDecor, decorHalfWidth, placeDecorations } from './decorations';
import { DECOR_SHAPES, PROP_SHAPES } from './look';

const tuning = loadTuning();
/** A prop may overhang the road edge by this much (m) before it counts as "on the road". */
const EDGE_SLACK = 0.3;

/** Half extents (m) of a prop or decoration as drawn (officeScale included), in its own x/z. */
const footprint = new Map<string, { hx: number; hz: number; cx: number; cz: number }>();
function footprintOf(kit: PropKit | DecorKit): { hx: number; hz: number; cx: number; cz: number } {
  let f = footprint.get(kit);
  if (!f) {
    const g = kit in DECOR_SHAPES ? buildDecor(kit as DecorKit) : buildProp(kit as PropKit);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    f = { hx: (b.max.x - b.min.x) / 2, hz: (b.max.z - b.min.z) / 2, cx: (b.max.x + b.min.x) / 2, cz: (b.max.z + b.min.z) / 2 };
    g.dispose();
    footprint.set(kit, f);
  }
  return f;
}

/** Pieces (the track's props by default) that stand on a road (drawn size), as "kit at (x, z)". */
function propsOnRoad(track: Track, pieces: readonly { kit: PropKit | DecorKit; x: number; z: number; rot: number }[] = track.def.props): string[] {
  const onRoad: string[] = [];
  for (const p of pieces) {
    const f = footprintOf(p.kit);
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    for (const [u, v] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const a = f.cx + u * f.hx;
      const b = f.cz + v * f.hz;
      const q = { x: p.x + a * c + b * s, z: p.z - a * s + b * c };
      const loc = locateOnTrack(track, q);
      if (Math.abs(loc.lateral) < loc.halfWidth - EDGE_SLACK || insideOtherRoad(track, q, loc.road)) {
        onRoad.push(`${p.kit} at (${p.x}, ${p.z})`);
        break;
      }
    }
  }
  return onRoad;
}

describe('track props (P10.6)', () => {
  it.each(trackIds())('%s: no prop stands on a road (drawn size)', (id) => {
    expect(propsOnRoad(loadTrack(id, tuning))).toEqual([]);
  });

  it.each(trackIds())('%s: the props showroom row stays off the roads', (id) => {
    expect(propsOnRoad(propsShowroom(loadTrack(id, tuning)).track)).toEqual([]);
  });
});

describe('seasonal decorations (P11.3)', () => {
  const seasons = loadSeasons();
  it.each(trackIds())('%s: every season decorates it, off the roads and clear of its props', (id) => {
    const track = loadTrack(id, tuning);
    for (const season of seasons.seasons) {
      const placed = placeDecorations(track, season.kits, seasons.decorations);
      expect(placed.length, `${season.id} pieces`).toBeGreaterThanOrEqual(Math.floor(seasons.decorations.perTrack / 2));
      expect(propsOnRoad(track, placed), season.id).toEqual([]);
      for (const d of placed) {
        for (const p of track.def.props) {
          expect(Math.hypot(p.x - d.x, p.z - d.z), `${d.kit} vs ${p.kit}`).toBeGreaterThanOrEqual(decorHalfWidth(d.kit) + shapeHalfWidth(PROP_SHAPES[p.kit]));
        }
      }
    }
  });

  it('placement is the same every time', () => {
    const track = loadTrack('office', tuning);
    const kits = seasons.seasons[0]!.kits;
    expect(placeDecorations(track, kits, seasons.decorations)).toEqual(placeDecorations(track, kits, seasons.decorations));
  });
});
