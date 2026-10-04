import type { Track, Tuning } from '@escape/shared';
import type { CarSnap } from './net/snapshots';
import { ChaseCam, placeOverview } from './render/cameras';
import { BoxCar } from './render/carMesh';
import { TEAM_COLORS } from './render/look';
import { createStage, type Stage } from './render/renderer';
import { buildTrackMeshes, type TrackMeshes } from './render/trackMesh';
import { liveStats } from './test-hooks';
import { DebugOverlay } from './ui/debugOverlay';

/** Where car states come from: the server (interpolated) or a local scenario sim. */
export interface CarSource {
  /** Fill `out` with the cars to draw at client time `now` (ms). */
  sample(now: number, out: Map<string, CarSnap>): void;
}

export type View = 'chase' | 'overview';

export interface GameOptions {
  container: HTMLElement;
  tuning: Tuning;
  track: Track;
  quality: Stage['quality'];
  source: CarSource;
  view: View;
  /** Car the chase cam follows (null = first car). */
  focus: () => string | null;
}

/** Longest frame step the camera smoothing accepts (s), so a hitch doesn't fling it. */
const MAX_FRAME_DT = 0.1;

/** The 3D race view: track, cars, camera, debug overlay. Runs its own frame loop. */
export class Game {
  private readonly stage: Stage;
  private readonly trackMeshes: TrackMeshes;
  private readonly chase: ChaseCam;
  private readonly overlay: DebugOverlay;
  private readonly cars = new Map<string, BoxCar>();
  private readonly snaps = new Map<string, CarSnap>();
  private frame = 0;
  private lastTime = -1;
  private running = false;

  constructor(private readonly opts: GameOptions) {
    this.stage = createStage(opts.container, opts.tuning, opts.quality);
    this.trackMeshes = buildTrackMeshes(opts.track);
    this.stage.scene.add(this.trackMeshes.group);
    this.chase = new ChaseCam(this.stage.camera);
    this.overlay = new DebugOverlay(opts.container, () => ({ ...liveStats }));
    if (opts.view === 'overview') {
      // From high above, fog would hide the whole track.
      this.stage.scene.fog = null;
      placeOverview(this.stage.camera, this.trackMeshes.bounds);
    }
  }

  start(): void {
    this.running = true;
    const loop = (now: number): void => {
      if (!this.running) return;
      this.renderFrame(now);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  /** Draw one frame at client time `now` (ms). `snapCamera` skips camera smoothing. */
  renderFrame(now: number, snapCamera = false): void {
    const dt = this.lastTime < 0 ? 0 : Math.min((now - this.lastTime) / 1000, MAX_FRAME_DT);
    this.lastTime = now;
    this.opts.source.sample(now, this.snaps);
    this.syncCars(dt);

    if (this.opts.view === 'chase') {
      const id = this.opts.focus() ?? this.snaps.keys().next().value ?? null;
      const car = id === null ? undefined : this.snaps.get(id);
      if (car) this.chase.update(this.opts.tuning.camera, car.x, car.y, car.z, car.yaw, dt, snapCamera);
    }

    const { renderer, scene, camera } = this.stage;
    renderer.render(scene, camera);
    const info = renderer.info;
    liveStats.drawCalls = info.render.calls;
    liveStats.triangles = info.render.triangles;
    liveStats.geometries = info.memory.geometries;
    liveStats.textures = info.memory.textures;
    liveStats.cars = this.cars.size;
    this.overlay.update(now);
  }

  private syncCars(dt: number): void {
    for (const [id, mesh] of this.cars) {
      if (!this.snaps.has(id)) {
        mesh.dispose();
        this.cars.delete(id);
      }
    }
    for (const [id, s] of this.snaps) {
      let mesh = this.cars.get(id);
      if (!mesh) {
        mesh = new BoxCar(TEAM_COLORS[this.cars.size % TEAM_COLORS.length] ?? TEAM_COLORS[0]!);
        this.cars.set(id, mesh);
        this.stage.scene.add(mesh.root);
      }
      mesh.update(s.x, s.y, s.z, s.yaw, s.speed, s.steer, dt, s.ghost || s.respawning);
    }
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    for (const mesh of this.cars.values()) mesh.dispose();
    this.cars.clear();
    this.overlay.dispose();
    this.trackMeshes.dispose();
    this.stage.dispose();
  }
}
