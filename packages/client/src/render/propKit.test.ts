import { PROP_KITS, type Track } from '@escape/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadTrack, loadTuning } from '../content';
import { triangles } from './carKit';
import { buildProp, buildProps } from './propKit';

const tuning = loadTuning();

describe('office prop kit', () => {
  it('every prop builds as one vertex-colored geometry inside the per-prop triangle budget', () => {
    for (const kind of PROP_KITS) {
      const g = buildProp(kind);
      expect(g.getAttribute('color')).toBeDefined();
      expect(triangles(g)).toBeLessThanOrEqual(tuning.quality.propMaxTriangles);
      g.dispose();
    }
  });

  it('a track draws each kind of prop as ONE instanced mesh, however many there are', () => {
    const base = loadTrack('test-loop', tuning);
    const track: Track = {
      ...base,
      def: {
        ...base.def,
        props: [
          { kit: 'desk', x: 0, z: 40, rot: 0 },
          { kit: 'desk', x: 5, z: 40, rot: 1 },
          { kit: 'desk', x: 10, z: 40, rot: 2 },
          { kit: 'plant', x: 15, z: 40, rot: 0 },
        ],
      },
    };
    const props = buildProps(track);
    const meshes = props.group.children as THREE.InstancedMesh[];
    expect(meshes.map((m) => [m.name, m.count])).toEqual([['props:desk', 3], ['props:plant', 1]]);
    props.dispose();
  });
});
