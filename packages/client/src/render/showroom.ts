import * as THREE from 'three';
import type { CarDef, QualityPreset, Tuning } from '@escape/shared';
import { CarMesh } from './carMesh';
import { liveStats } from '../test-hooks';
import { PALETTE, SHOWROOM, TEAM_COLORS } from './look';
import { createStage, type Stage } from './renderer';

/** Which roster car the turntable shows `seconds` after it started. Pure, for tests. */
export const showroomIndex = (seconds: number, cars: number): number =>
  cars <= 0 ? 0 : Math.floor(Math.max(seconds, 0) / SHOWROOM.carSeconds) % cars;

/**
 * Main menu backdrop: the roster's cars, one at a time, spinning on a turntable (each new
 * one drops in with a squash). Its own small stage, behind the menu.
 */
export class Showroom {
  private readonly stage: Stage;
  private readonly table: THREE.Group;
  private readonly floor: THREE.Mesh;
  private car: CarMesh | null = null;
  private shown = -1;
  private startTime = -1;
  private last = -1;

  constructor(container: HTMLElement, tuning: Tuning, quality: QualityPreset, private readonly roster: readonly CarDef[]) {
    this.stage = createStage(container, tuning, quality);
    const S = SHOWROOM;
    this.table = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(S.tableRadius, S.tableRadius, S.tableHeight, 48),
      new THREE.MeshLambertMaterial({ color: S.tableColor }),
    );
    disc.position.y = -S.tableHeight / 2;
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(S.tableRadius + 0.15, S.tableRadius + 0.15, S.tableHeight * 0.8, 48),
      new THREE.MeshLambertMaterial({ color: S.tableRim }),
    );
    rim.position.y = -S.tableHeight / 2 - 0.02;
    this.table.add(rim, disc);
    this.table.position.y = S.tableHeight;
    // The office floor, fading into the fog.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(S.floorRadius, 48), new THREE.MeshLambertMaterial({ color: PALETTE.carpet }));
    floor.rotation.x = -Math.PI / 2;
    this.stage.scene.add(this.table, floor);
    this.floor = floor;
    const cam = this.stage.camera;
    cam.position.set(0, S.camHeight, S.camDistance);
    cam.lookAt(-S.lookLeft, S.lookHeight, 0);
  }

  /** The car on the table now (for the HONK button). */
  get current(): CarDef | undefined {
    return this.roster[this.shown];
  }

  /** Draw at time `now` (ms). */
  render(now: number): void {
    if (this.startTime < 0) this.startTime = now;
    const dt = this.last < 0 ? 0 : Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const index = showroomIndex((now - this.startTime) / 1000, this.roster.length);
    if (index !== this.shown) this.show(index);
    this.table.rotation.y += SHOWROOM.spin * dt;
    if (this.car) {
      this.car.update(0, 0, 0, 0, 0, 0, dt, false);
      this.car.root.position.y = SHOWROOM.tableHeight;
      this.car.root.rotation.y = this.table.rotation.y;
    }
    const r = this.stage.renderer;
    r.info.reset();
    r.render(this.stage.scene, this.stage.camera);
    liveStats.drawCalls = r.info.render.calls;
    liveStats.triangles = r.info.render.triangles;
  }

  private show(index: number): void {
    const def = this.roster[index];
    if (!def) return;
    this.car?.dispose();
    this.car = new CarMesh(def.look, TEAM_COLORS[index % TEAM_COLORS.length]!, index + 1);
    this.car.setSeat('left', { kind: 'duck' }, 0, 0, 0, 0);
    this.car.jolt(SHOWROOM.dropImpact, true);
    this.stage.scene.add(this.car.root);
    this.shown = index;
  }

  dispose(): void {
    this.car?.dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.table.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.stage.dispose();
  }
}
