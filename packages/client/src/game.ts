import { angleDiff, type Track, type Tuning } from '@escape/shared';
import type { CarSnap } from './net/snapshots';
import { ChaseCam, placeOverview } from './render/cameras';
import { CockpitCam, type SeatSide } from './render/cockpitCam';
import { BoxCar, type SeatContent } from './render/carMesh';
import { FaceMaterials } from './render/faceTexture';
import { HeadSmoother } from './net/heads';
import { TEAM_COLORS } from './render/look';
import { createStage, type Stage } from './render/renderer';
import { buildTrackMeshes, type TrackMeshes } from './render/trackMesh';
import { focusPose, liveStats } from './test-hooks';
import { DebugOverlay } from './ui/debugOverlay';

/** Where car states come from: the server (interpolated) or a local scenario sim. */
export interface CarSource {
  /** Fill `out` with the cars to draw at client time `now` (ms). */
  sample(now: number, out: Map<string, CarSnap>): void;
}

export type View = 'chase' | 'cockpit' | 'overview';

export interface GameOptions {
  container: HTMLElement;
  tuning: Tuning;
  track: Track;
  quality: Stage['quality'];
  source: CarSource;
  view: View;
  /** Car the chase cam follows (null = first car). */
  focus: () => string | null;
  /** Who sits in each car (for bobbleheads); null/undefined = empty seats. */
  occupants?: (carId: string) => CarSeats | null;
  /** Cockpit cam: which seat you sit in (default left). */
  seatSide?: () => SeatSide;
  /** Cockpit cam: is the mouse captured for looking around? */
  mouseLocked?: () => boolean;
  /** Called at the start of every frame with the client time (ms), for per-frame stats. */
  onFrame?: (now: number) => void;
}

/** A player in a seat: their face, where they look (synced), and whether it is you. */
export interface SeatPerson {
  id: string;
  face: string;
  yaw: number;
  pitch: number;
  me: boolean;
}

export interface CarSeats {
  left: SeatPerson | 'duck' | null;
  right: SeatPerson | 'duck' | null;
}

/** Team color: by car slot for server cars ("car3" → slot 3), else by arrival order (scenario bots). */
function teamColor(id: string, index: number): number {
  const slot = /^car(\d+)$/.exec(id);
  const i = slot ? Number(slot[1]) : index;
  return TEAM_COLORS[i % TEAM_COLORS.length] ?? TEAM_COLORS[0]!;
}

/** Longest frame step the camera smoothing accepts (s), so a hitch doesn't fling it. */
const MAX_FRAME_DT = 0.1;

/** The 3D race view: track, cars, camera, debug overlay. Runs its own frame loop. */
export class Game {
  private readonly stage: Stage;
  private readonly trackMeshes: TrackMeshes;
  private readonly chase: ChaseCam;
  private readonly cockpit: CockpitCam;
  private readonly faces = new FaceMaterials();
  private readonly heads = new HeadSmoother();
  /** Last frame's speed and heading per car, to work out acceleration for the wobble. */
  private readonly motion = new Map<string, { speed: number; yaw: number }>();
  /** Car currently showing its dashboard (your car in cockpit view). */
  private dashCar: string | null = null;
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
    this.cockpit = new CockpitCam(this.stage.camera);
    this.overlay = new DebugOverlay(opts.container, () => ({ ...liveStats }));
    if (opts.view === 'overview') {
      // From high above, fog would hide the whole track.
      this.stage.scene.fog = null;
      placeOverview(this.stage.camera, this.trackMeshes.bounds);
    }
  }

  /** New tuning from the server or the F2 panel (camera feel applies at once). */
  setTuning(t: Tuning): void {
    this.opts.tuning = t;
  }

  get view(): View {
    return this.opts.view;
  }

  /** Switch between chase and cockpit (overview is only for the overview scenario). */
  setView(view: View): void {
    this.opts.view = view;
  }

  /** Your head angles in the cockpit (0, 0 in other views), to share with your teammate. */
  get head(): { yaw: number; pitch: number } {
    return this.opts.view === 'cockpit' ? { yaw: this.cockpit.headYaw, pitch: this.cockpit.headPitch } : { yaw: 0, pitch: 0 };
  }

  /** The canvas (for Pointer Lock). */
  get canvas(): HTMLCanvasElement {
    return this.stage.renderer.domElement;
  }

  /** Point the cockpit head (scenarios: look at your teammate). */
  lookAt(yaw: number, pitch: number): void {
    this.cockpit.headYaw = yaw;
    this.cockpit.headPitch = pitch;
  }

  /** Mouse moved while captured (cockpit look). */
  mouse(dx: number, dy: number): void {
    if (this.opts.view === 'cockpit') this.cockpit.mouse(dx, dy, this.opts.tuning.camera);
  }

  /** Something jolted your car (wall, landing, bump): shake the cockpit head a little. */
  bump(strength: number): void {
    this.cockpit.bump(strength, this.opts.tuning.camera);
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
    this.opts.onFrame?.(now);
    this.opts.source.sample(now, this.snaps);
    this.syncCars(dt);

    const view = this.opts.view;
    if (view === 'chase' || view === 'cockpit') {
      const id = this.opts.focus() ?? this.snaps.keys().next().value ?? null;
      const car = id === null ? undefined : this.snaps.get(id);
      const cam = this.opts.tuning.camera;
      if (car && view === 'cockpit') {
        const locked = this.opts.mouseLocked?.() ?? false;
        this.cockpit.update(cam, car.x, car.y, car.z, car.yaw, this.opts.seatSide?.() ?? 'left', dt, locked);
      } else if (car) {
        this.chase.update(cam, car.x, car.y, car.z, car.yaw, dt, snapCamera);
      }
      this.showDash(view === 'cockpit' && id !== null ? id : null);
      focusPose.set = car !== undefined;
      if (car) {
        focusPose.x = car.x;
        focusPose.z = car.z;
        focusPose.yaw = car.yaw;
        focusPose.speed = car.speed;
      }
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

  /** Only your own car, only in the cockpit, shows its dashboard. */
  private showDash(id: string | null): void {
    if (id === this.dashCar) {
      if (id) this.cars.get(id)?.setCockpit(true); // keep it on the car (height follows jumps)
      return;
    }
    if (this.dashCar) this.cars.get(this.dashCar)?.setCockpit(false);
    this.dashCar = id;
    if (id) this.cars.get(id)?.setCockpit(true);
  }

  /** Bobbleheads / duck for one car, wobbling with its acceleration. */
  private updateSeats(id: string, mesh: BoxCar, s: CarSnap, dt: number): void {
    let m = this.motion.get(id);
    if (!m) {
      m = { speed: s.speed, yaw: s.yaw };
      this.motion.set(id, m);
    }
    const forwardAccel = dt > 0 ? (s.speed - m.speed) / dt : 0;
    const sideAccel = dt > 0 ? (s.speed * angleDiff(m.yaw, s.yaw)) / dt : 0;
    m.speed = s.speed;
    m.yaw = s.yaw;
    const seats = this.opts.occupants?.(id) ?? null;
    const inCockpit = this.opts.view === 'cockpit';
    for (const side of ['left', 'right'] as const) {
      const who = seats?.[side] ?? null;
      let content: SeatContent = null;
      if (who === 'duck') content = { kind: 'duck' };
      else if (who) {
        const head = this.heads.step(who.id, who.yaw, who.pitch, dt);
        content = { kind: 'head', material: this.faces.get(who.face), yaw: head.yaw, pitch: head.pitch, hidden: who.me && inCockpit };
      }
      mesh.setSeat(side, content, s.y, forwardAccel, sideAccel, dt);
    }
  }

  private syncCars(dt: number): void {
    for (const [id, mesh] of this.cars) {
      if (!this.snaps.has(id)) {
        mesh.dispose();
        this.cars.delete(id);
        this.motion.delete(id);
      }
    }
    for (const [id, s] of this.snaps) {
      let mesh = this.cars.get(id);
      if (!mesh) {
        mesh = new BoxCar(teamColor(id, this.cars.size));
        this.cars.set(id, mesh);
        this.stage.scene.add(mesh.root);
      }
      mesh.update(s.x, s.y, s.z, s.yaw, s.speed, s.steer, dt, s.ghost || s.respawning);
      this.updateSeats(id, mesh, s, dt);
    }
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    for (const mesh of this.cars.values()) mesh.dispose();
    this.cars.clear();
    this.overlay.dispose();
    this.faces.dispose();
    this.trackMeshes.dispose();
    this.stage.dispose();
  }
}
