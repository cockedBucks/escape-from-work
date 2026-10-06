import * as THREE from 'three';
import { insideRoad, type Track, type TrackSample, type Vec2 } from '@escape/shared';
import { PALETTE, TRACK_LOOK } from './look';
import { buildProps } from './propKit';

/** Builds flat ribbons along the track: one quad per sample step between two offset lines. */
class RibbonBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  /** Add one quad (a0, a1 = start edge; b0, b1 = end edge), each point at its own height. */
  quad(a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3, color?: THREE.Color): void {
    const base = this.positions.length / 3;
    for (const p of [a0, a1, b0, b1]) {
      this.positions.push(p.x, p.y, p.z);
      if (color) this.colors.push(color.r, color.g, color.b);
    }
    // Two triangles, wound counter-clockwise seen from above (+Y).
    this.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    if (this.colors.length > 0) g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    g.computeVertexNormals();
    return g;
  }
}

/** Flat markings drawn on the road win the depth test even from far away (no flicker). */
const DECAL = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;

const v3 = (p: Vec2, y: number, side: Vec2, offset: number): THREE.Vector3 =>
  new THREE.Vector3(p.x + side.x * offset, y, p.z + side.z * offset);

/** Make sure a quad faces up: flip if the winding came out facing down. */
function upQuad(rb: RibbonBuilder, a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3, c?: THREE.Color): void {
  const n = new THREE.Vector3().subVectors(b0, a0).cross(new THREE.Vector3().subVectors(a1, a0));
  if (n.y < 0) rb.quad(a1, a0, b1, b0, c);
  else rb.quad(a0, a1, b0, b1, c);
}

/** Inclusive sample range for a zone's progress range. */
function zoneSamples(track: Track, from: number, to: number): [number, number] {
  const n = track.samples.length;
  return [Math.floor(from * n), Math.min(Math.ceil(to * n), n)];
}

export interface TrackMeshes {
  group: THREE.Group;
  /** Track bounds (for the overview camera and the ground). */
  bounds: THREE.Box3;
  dispose(): void;
}

/**
 * Greybox track from the built track data: ground, road ribbon, curbs on curves, walls,
 * start line, ramp wedges and slick patches. Static geometry is merged per material.
 */
export function buildTrackMeshes(track: Track): TrackMeshes {
  const L = TRACK_LOOK;
  const n = track.samples.length;
  const sample = (i: number): TrackSample => track.samples[((i % n) + n) % n] as TrackSample;
  const disposables: { dispose(): void }[] = [];
  const group = new THREE.Group();
  group.name = 'track';

  // Road ribbon.
  const road = new RibbonBuilder();
  for (let i = 0; i < n; i++) {
    const a = sample(i);
    const b = sample(i + 1);
    upQuad(road, v3(a.pos, 0, a.right, -a.width / 2), v3(a.pos, 0, a.right, a.width / 2),
      v3(b.pos, 0, b.right, -b.width / 2), v3(b.pos, 0, b.right, b.width / 2));
  }
  // Shortcuts: their own ribbons (the walls are already merged into `track.walls`).
  for (const br of track.branches) {
    for (let i = 0; i + 1 < br.samples.length; i++) {
      const a = br.samples[i]!;
      const b = br.samples[i + 1]!;
      upQuad(road, v3(a.pos, 0, a.right, -a.width / 2), v3(a.pos, 0, a.right, a.width / 2),
        v3(b.pos, 0, b.right, -b.width / 2), v3(b.pos, 0, b.right, b.width / 2));
    }
  }

  // Curbs: red/white stripes along both edges where the road bends.
  const curbs = new RibbonBuilder();
  const red = new THREE.Color(PALETTE.curbRed);
  const white = new THREE.Color(PALETTE.line);
  for (let i = 0; i < n; i++) {
    const a = sample(i);
    const b = sample(i + 1);
    if (Math.abs(a.curvature) < L.curbMinCurvature) continue;
    const color = Math.floor(i / L.curbStripeSamples) % 2 === 0 ? red : white;
    const y = L.decalLift;
    for (const s of [-1, 1]) {
      const inner = (w: number) => s * (w / 2 - L.curbWidth);
      const outer = (w: number) => s * (w / 2);
      upQuad(curbs, v3(a.pos, y, a.right, inner(a.width)), v3(a.pos, y, a.right, outer(a.width)),
        v3(b.pos, y, b.right, inner(b.width)), v3(b.pos, y, b.right, outer(b.width)), color);
    }
  }

  // Dashed center line: the dashes rushing past are what make speed visible.
  {
    const period = L.centerDash + L.centerGap;
    const y = L.decalLift;
    const half = L.centerWidth / 2;
    const dashes = (line: readonly TrackSample[], closed: boolean): void => {
      const count = closed ? line.length : line.length - 1;
      for (let i = 0; i < count; i++) {
        const a = line[i]!;
        const b = line[(i + 1) % line.length]!;
        if (a.dist % period >= L.centerDash) continue;
        upQuad(curbs, v3(a.pos, y, a.right, -half), v3(a.pos, y, a.right, half),
          v3(b.pos, y, b.right, -half), v3(b.pos, y, b.right, half), white);
      }
    };
    dashes(track.samples, true);
    for (const br of track.branches) dashes(br.samples, false);
  }

  // Start line across the road at gate 0.
  const gate = track.gates[0];
  if (gate) {
    const s = sample(gate.sample);
    const half = L.startLineWidth / 2;
    const y = L.decalLift * 2;
    const back = { x: s.pos.x - s.dir.x * half, z: s.pos.z - s.dir.z * half };
    const front = { x: s.pos.x + s.dir.x * half, z: s.pos.z + s.dir.z * half };
    upQuad(curbs, v3(back, y, s.right, -s.width / 2), v3(back, y, s.right, s.width / 2),
      v3(front, y, s.right, -s.width / 2), v3(front, y, s.right, s.width / 2), white);
  }

  // Ramps: a wedge rising over the zone, then a vertical drop at its end.
  const ramps = new RibbonBuilder();
  const slicks = new RibbonBuilder();
  const swaps = new RibbonBuilder();
  const swapColors = TRACK_LOOK.swapColors.map((c) => new THREE.Color(c));
  for (const zone of track.rangedZones) {
    const [i0, i1] = zoneSamples(track, zone.from, zone.to);
    if (zone.type === 'ramp') {
      const span = Math.max(i1 - i0, 1);
      for (let i = i0; i < i1; i++) {
        const a = sample(i);
        const b = sample(i + 1);
        const ya = ((i - i0) / span) * L.rampHeight + L.decalLift;
        const yb = ((i + 1 - i0) / span) * L.rampHeight + L.decalLift;
        upQuad(ramps, v3(a.pos, ya, a.right, -a.width / 2), v3(a.pos, ya, a.right, a.width / 2),
          v3(b.pos, yb, b.right, -b.width / 2), v3(b.pos, yb, b.right, b.width / 2));
      }
      const e = sample(i1);
      const top = L.rampHeight + L.decalLift;
      // Back face of the wedge (faces forward, toward the landing).
      ramps.quad(v3(e.pos, top, e.right, e.width / 2), v3(e.pos, top, e.right, -e.width / 2),
        v3(e.pos, 0, e.right, e.width / 2), v3(e.pos, 0, e.right, -e.width / 2));
    } else if (zone.type === 'swap') {
      // Its half of the road, striped so it reads as a lane from far away.
      for (let i = i0; i < i1; i++) {
        const a = sample(i);
        const b = sample(i + 1);
        const lo = (w: number) => (zone.side === 'right' ? 0 : -w / 2);
        const hi = (w: number) => (zone.side === 'right' ? w / 2 : 0);
        const y = L.decalLift * 3;
        const color = swapColors[Math.floor((i - i0) / TRACK_LOOK.swapStripeSamples) % swapColors.length]!;
        upQuad(swaps, v3(a.pos, y, a.right, lo(a.width)), v3(a.pos, y, a.right, hi(a.width)),
          v3(b.pos, y, b.right, lo(b.width)), v3(b.pos, y, b.right, hi(b.width)), color);
      }
    } else if (zone.type === 'slick') {
      for (let i = i0; i < i1; i++) {
        const a = sample(i);
        const b = sample(i + 1);
        const lo = (w: number) => (zone.side === 'right' ? 0 : -w / 2);
        const hi = (w: number) => (zone.side === 'left' ? 0 : w / 2);
        const y = L.decalLift * 3;
        upQuad(slicks, v3(a.pos, y, a.right, lo(a.width)), v3(a.pos, y, a.right, hi(a.width)),
          v3(b.pos, y, b.right, lo(b.width)), v3(b.pos, y, b.right, hi(b.width)));
      }
    }
  }

  // Walls: thin vertical slabs along every wall segment (inner face + top).
  const wallRb = new RibbonBuilder();
  for (const w of track.walls) {
    const out = { x: -w.normal.x * L.wallThickness, z: -w.normal.z * L.wallThickness };
    const a = new THREE.Vector3(w.a.x, 0, w.a.z);
    const b = new THREE.Vector3(w.b.x, 0, w.b.z);
    const aTop = new THREE.Vector3(w.a.x, L.wallHeight, w.a.z);
    const bTop = new THREE.Vector3(w.b.x, L.wallHeight, w.b.z);
    const aOut = new THREE.Vector3(w.a.x + out.x, L.wallHeight, w.a.z + out.z);
    const bOut = new THREE.Vector3(w.b.x + out.x, L.wallHeight, w.b.z + out.z);
    // Inner face: make it face the road (its normal points along the wall normal).
    const faceN = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(aTop, a));
    if (faceN.x * w.normal.x + faceN.z * w.normal.z < 0) wallRb.quad(a, aTop, b, bTop);
    else wallRb.quad(aTop, a, bTop, b);
    upQuad(wallRb, aTop, aOut, bTop, bOut);
  }

  const bounds = new THREE.Box3();
  for (const s of [...track.samples, ...track.branches.flatMap((br) => br.samples)]) {
    bounds.expandByPoint(new THREE.Vector3(s.pos.x - s.width, 0, s.pos.z - s.width));
    bounds.expandByPoint(new THREE.Vector3(s.pos.x + s.width, 0, s.pos.z + s.width));
  }

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, receiveShadow = true): void => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    disposables.push(geo, mat);
  };

  // Ground.
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const groundGeo = new THREE.PlaneGeometry(size.x + TRACK_LOOK.groundMargin * 2, size.z + TRACK_LOOK.groundMargin * 2);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(center.x, -L.decalLift, center.z);

  // Pushed back in depth so the road always wins over it, even far away (no flicker).
  add(groundGeo, new THREE.MeshLambertMaterial({ color: PALETTE.sand, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }), 'ground');
  add(road.build(), new THREE.MeshLambertMaterial({ color: PALETTE.road }), 'road');
  add(curbs.build(), new THREE.MeshLambertMaterial({ vertexColors: true, ...DECAL }), 'curbs');
  add(wallRb.build(), new THREE.MeshLambertMaterial({ color: PALETTE.cubicle, flatShading: true }), 'walls');
  if (ramps.indices.length > 0) {
    add(ramps.build(), new THREE.MeshLambertMaterial({ color: PALETTE.desk, flatShading: true, side: THREE.DoubleSide }), 'ramps');
  }
  if (slicks.indices.length > 0) {
    add(slicks.build(), new THREE.MeshLambertMaterial({
      color: TRACK_LOOK.slickColor, transparent: true, opacity: TRACK_LOOK.slickOpacity, depthWrite: false, ...DECAL,
    }), 'slicks');
  }

  // Roadside posts (one instanced draw call), alternating red / white.
  const postSpots: { x: number; z: number }[] = [];
  for (let d = 0; d < track.length; d += L.postSpacing) {
    const s = sample(Math.round(d / track.spacing));
    for (const side of [-1, 1]) {
      const off = side * (s.width / 2 + L.postOut);
      const spot = { x: s.pos.x + s.right.x * off, z: s.pos.z + s.right.z * off };
      // Not in a shortcut's mouth (or on another stretch of road).
      if (!insideRoad(track, spot, -L.postSize)) postSpots.push(spot);
    }
  }
  if (postSpots.length > 0) {
    const postGeo = new THREE.BoxGeometry(L.postSize, L.postHeight, L.postSize);
    postGeo.translate(0, L.postHeight / 2, 0);
    const postMat = new THREE.MeshLambertMaterial();
    const posts = new THREE.InstancedMesh(postGeo, postMat, postSpots.length);
    const m = new THREE.Matrix4();
    postSpots.forEach((p, i) => {
      posts.setMatrixAt(i, m.makeTranslation(p.x, 0, p.z));
      posts.setColorAt(i, Math.floor(i / 2) % 2 === 0 ? red : white);
    });
    posts.name = 'posts';
    posts.castShadow = true;
    group.add(posts);
    disposables.push(postGeo, postMat, posts);
  }

  if (swaps.indices.length > 0) {
    add(swaps.build(), new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, opacity: TRACK_LOOK.swapOpacity, depthWrite: false, ...DECAL,
    }), 'swapLanes');
  }

  // Props (desks, plants, printers…): one instanced draw call per kind.
  const props = buildProps(track);
  group.add(props.group);
  disposables.push(props);

  return {
    group,
    bounds,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
