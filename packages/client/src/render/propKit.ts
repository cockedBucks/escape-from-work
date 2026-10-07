import * as THREE from 'three';
import { PROP_KITS, insideOtherRoad, locateOnTrack, type PropKit, type Track } from '@escape/shared';
import { Builder } from './kitBuilder';
import { PROP_COLORS, PROP_LOOK, PROP_SHAPES, type PropPrim } from './look';

/** One prop as a single vertex-colored geometry, `officeScale` times its real size. */
export function buildProp(kind: PropKit): THREE.BufferGeometry {
  return buildShape(PROP_SHAPES[kind]);
}

/** Half the widest extent of a shape as drawn (m, `officeScale` included). */
export function shapeHalfWidth(prims: readonly PropPrim[]): number {
  let half = 0;
  for (const p of prims) {
    const sx = p.s === 'box' ? p.size[0]! / 2 : p.size[0]!;
    const sz = p.s === 'box' ? p.size[2]! / 2 : p.s === 'cyl' ? p.size[0]! : p.size[2]!;
    half = Math.max(half, Math.abs(p.at[0]) + sx, Math.abs(p.at[2]) + sz);
  }
  return half * PROP_LOOK.officeScale;
}

/** Is a square of half size `half` around (x, z) clear of every road (main road and shortcuts)? */
export function clearOfRoads(track: Track, x: number, z: number, half: number): boolean {
  for (const u of [-1, 0, 1]) {
    for (const v of [-1, 0, 1]) {
      const q = { x: x + u * half, z: z + v * half };
      const loc = locateOnTrack(track, q);
      if (Math.abs(loc.lateral) < loc.halfWidth || insideOtherRoad(track, q, loc.road)) return false;
    }
  }
  return true;
}

/** Primitives as one vertex-colored geometry, `officeScale` times their real size. */
export function buildShape(prims: readonly PropPrim[]): THREE.BufferGeometry {
  const b = new Builder(PROP_LOOK.roundSegments);
  for (const p of prims) {
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
