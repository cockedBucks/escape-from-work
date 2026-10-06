import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shared by the car kit and the prop kit: low-poly primitives with a flat color each, merged
// into ONE vertex-colored geometry (one draw call; instanced for repeated props).

/** Collects colored primitives and merges them into one geometry. */
export class Builder {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly color = new THREE.Color();

  /** `segments`: roundness of blobs and cylinders (low-poly). */
  constructor(private readonly segments: number) {}

  add(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rotX = 0, rotY = 0, rotZ = 0): void {
    const g = geo;
    if (rotX) g.rotateX(rotX);
    if (rotY) g.rotateY(rotY);
    if (rotZ) g.rotateZ(rotZ);
    g.translate(x, y, z);
    this.color.setHex(color);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = this.color.r;
      colors[i * 3 + 1] = this.color.g;
      colors[i * 3 + 2] = this.color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
  }

  box(w: number, h: number, l: number, color: number, x: number, y: number, z: number, rotX = 0): void {
    this.add(new THREE.BoxGeometry(w, h, l), color, x, y, z, rotX);
  }

  /** A low-poly ellipsoid (sphere scaled to the given radii). */
  blob(rx: number, ry: number, rz: number, color: number, x: number, y: number, z: number): void {
    const g = new THREE.SphereGeometry(1, this.segments, Math.max(4, this.segments - 3));
    g.scale(rx, ry, rz);
    this.add(g, color, x, y, z);
  }

  /** A cylinder; `axis` 'x' | 'y' | 'z' it lies along. */
  cyl(r: number, len: number, color: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y'): void {
    const g = new THREE.CylinderGeometry(r, r, len, this.segments);
    this.add(g, color, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts);
    for (const p of this.parts) p.dispose();
    if (!merged) throw new Error('kit: could not merge the parts');
    return merged;
  }
}
