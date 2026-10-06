import * as THREE from 'three';
import { PROP_KITS, type PropKit, type Track } from '@escape/shared';
import { Builder } from './kitBuilder';
import { PROP_COLORS, PROP_LOOK, PROP_SHAPES } from './look';

/** One prop as a single vertex-colored geometry, `officeScale` times its real size. */
export function buildProp(kind: PropKit): THREE.BufferGeometry {
  const b = new Builder(PROP_LOOK.roundSegments);
  for (const p of PROP_SHAPES[kind]) {
    const [x, y, z] = p.at;
    const color = PROP_COLORS[p.color];
    if (p.s === 'box') b.box(p.size[0]!, p.size[1]!, p.size[2]!, color, x, y, z);
    else if (p.s === 'cyl') b.cyl(p.size[0]!, p.size[1]!, color, x, y, z);
    else b.blob(p.size[0]!, p.size[1]!, p.size[2]!, color, x, y, z);
  }
  const g = b.build();
  g.scale(PROP_LOOK.officeScale, PROP_LOOK.officeScale, PROP_LOOK.officeScale);
  return g;
}

/**
 * A track's props: one InstancedMesh per kind (so a hundred desks are one draw call), all
 * sharing one flat-shaded vertex-color material.
 */
export function buildProps(track: Track): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  group.name = 'props';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const disposables: { dispose(): void }[] = [material];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  for (const kind of PROP_KITS) {
    const placed = track.def.props.filter((pr) => pr.kit === kind);
    if (placed.length === 0) continue;
    const geo = buildProp(kind);
    const mesh = new THREE.InstancedMesh(geo, material, placed.length);
    placed.forEach((pr, i) => mesh.setMatrixAt(i, m.compose(p.set(pr.x, 0, pr.z), q.setFromAxisAngle(up, pr.rot), one)));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `props:${kind}`;
    group.add(mesh);
    disposables.push(geo, mesh);
  }
  return { group, dispose: () => disposables.forEach((d) => d.dispose()) };
}
