import * as THREE from 'three';
import type { CarDef } from '@escape/shared';
import { CarMesh } from './carMesh';
import { CAR_PICTURE, LIGHT, TEAM_COLORS } from './look';

// Car pictures (P12.3): each roster car in a team's color, rendered once on a small offscreen
// canvas and kept as an image URL for the lobby cards and the garage. One WebGL context for
// all pictures, made on first use.

/** The cache key of a car in a slot's color. Pure, for tests. */
export const pictureKey = (carId: string, slot: number): string => `${carId}|${slot % TEAM_COLORS.length}`;

/** Makes and keeps the pictures. `url` is '' when WebGL is not available (the page shows no picture). */
export class CarPictures {
  private renderer: THREE.WebGLRenderer | null = null;
  private failed = false;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly urls = new Map<string, string>();

  constructor(private readonly roster: readonly CarDef[]) {
    const P = CAR_PICTURE;
    this.camera = new THREE.PerspectiveCamera(P.fov, P.width / P.height, 0.1, 100);
    this.camera.position.set(...P.camera);
    this.camera.lookAt(...P.target);
    this.scene.add(new THREE.HemisphereLight(LIGHT.skyColor, LIGHT.groundColor, LIGHT.hemiIntensity));
    const sun = new THREE.DirectionalLight(LIGHT.sunColor, LIGHT.sunIntensity);
    const [dx, dy, dz] = LIGHT.sunDir;
    sun.position.set(-dx, -dy, -dz);
    this.scene.add(sun);
  }

  /** The picture of roster car `carId` in slot `slot`'s team color (with its number). */
  url(carId: string, slot: number): string {
    const key = pictureKey(carId, slot);
    const known = this.urls.get(key);
    if (known !== undefined) return known;
    const def = this.roster.find((d) => d.id === carId);
    const r = this.context();
    if (!def || !r) return '';
    const n = slot % TEAM_COLORS.length;
    const car = new CarMesh(def.look, TEAM_COLORS[n]!, n + 1);
    car.update(0, 0, 0, CAR_PICTURE.yaw, 0, 0, 0, false);
    this.scene.add(car.root);
    r.render(this.scene, this.camera);
    const url = r.domElement.toDataURL('image/png');
    car.dispose();
    this.urls.set(key, url);
    return url;
  }

  private context(): THREE.WebGLRenderer | null {
    if (this.renderer || this.failed) return this.renderer;
    try {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1);
      r.setSize(CAR_PICTURE.width, CAR_PICTURE.height, false);
      r.setClearColor(0x000000, 0);
      this.renderer = r;
    } catch {
      this.failed = true; // no WebGL: the lobby works without pictures
    }
    return this.renderer;
  }

  dispose(): void {
    // Give the second WebGL context back now, not whenever the garbage collector runs.
    this.renderer?.forceContextLoss();
    this.renderer?.dispose();
    this.renderer = null;
    this.urls.clear();
  }
}
