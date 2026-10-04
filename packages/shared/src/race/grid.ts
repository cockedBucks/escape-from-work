import type { Tuning } from '../config/tuning';
import type { Track, TrackSample } from '../track/build';
import { yawOf, type Vec2 } from '../util/math';

export interface GridSpot {
  pos: Vec2;
  yaw: number;
  /** Centerline sample the spot sits on (hint for the first track lookup). */
  sample: number;
}

/**
 * Starting spot for grid position `index` (0 = pole): rows of two behind the start line,
 * left then right, following the track's curve. Row 0 sits `gridRowSpacing` behind the line.
 */
export function gridSpot(track: Track, index: number, race: Tuning['race']): GridSpot {
  const n = track.samples.length;
  const start = track.gates[0]?.sample ?? 0;
  const row = Math.floor(index / 2);
  const back = Math.round(((row + 1) * race.gridRowSpacing) / track.spacing);
  const sample = (((start - back) % n) + n) % n;
  const s = track.samples[sample] as TrackSample;
  const side = index % 2 === 0 ? -1 : 1; // left first
  const lateral = Math.min(race.gridLateral, s.width / 2) * side;
  return {
    pos: { x: s.pos.x + s.right.x * lateral, z: s.pos.z + s.right.z * lateral },
    yaw: yawOf(s.dir),
    sample,
  };
}
