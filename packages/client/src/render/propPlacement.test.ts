import { insideOtherRoad, locateOnTrack, type PropKit } from '@escape/shared';
import { describe, expect, it } from 'vitest';
import { loadTrack, loadTuning, trackIds } from '../content';
import { buildProp } from './propKit';

const tuning = loadTuning();
/** A prop may overhang the road edge by this much (m) before it counts as "on the road". */
const EDGE_SLACK = 0.3;

/** Half extents (m) of a prop as drawn (officeScale included), in its own x/z. */
const footprint = new Map<PropKit, { hx: number; hz: number; cx: number; cz: number }>();
function footprintOf(kit: PropKit): { hx: number; hz: number; cx: number; cz: number } {
  let f = footprint.get(kit);
  if (!f) {
    const g = buildProp(kit);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    f = { hx: (b.max.x - b.min.x) / 2, hz: (b.max.z - b.min.z) / 2, cx: (b.max.x + b.min.x) / 2, cz: (b.max.z + b.min.z) / 2 };
    g.dispose();
    footprint.set(kit, f);
  }
  return f;
}

describe('track props (P10.6)', () => {
  it.each(trackIds())('%s: no prop stands on a road (drawn size)', (id) => {
    const track = loadTrack(id, tuning);
    const onRoad: string[] = [];
    for (const p of track.def.props) {
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
    expect(onRoad).toEqual([]);
  });
});
