import { angleDiff, buildBoxes, type CarLook, type Track, type Tuning } from '@escape/shared';
import type { CarSnap } from './net/snapshots';
import { ChaseCam, placeOverview } from './render/cameras';
import { Weather } from './render/weather';
import { Shake } from './render/juice';
import { JUICE } from './render/look';
import { CockpitCam, type SeatSide } from './render/cockpitCam';
import { CarMesh, lookKeyOf, type SeatContent } from './render/carMesh';
import type * as THREE from 'three';
import { DashboardScreen } from './render/dashboard';
import { Bubbles } from './ui/bubbles';
import { RearMirror } from './render/mirror';
import { FaceMaterials } from './render/faceTexture';
import { Smoke } from './render/smoke';
import { Sparks } from './render/sparks';
import { ItemProps, type ItemsView } from './render/itemProps';
import { SpeedLines, speedLineStrength } from './ui/speedLines';
import type { GaugeValues } from './ui/gauges';
import { HeadSmoother } from './net/heads';
import { TEAM_COLORS } from './render/look';
import { LIGHT } from './render/look';
import { CAMERA_NEAR, createStage, type Stage } from './render/renderer';
import { buildTrackMeshes, type TrackMeshes } from './render/trackMesh';
import { focusPose, liveStats, otherPose } from './test-hooks';
import { DebugOverlay } from './ui/debugOverlay';
import { LapGhostMesh } from './render/lapGhost';
import { Snowfall, buildDecorations, type PlacedDecor } from './render/decorations';
import type { GhostPose } from './ghost/ghostLap';
import { sampleClip, type ReplayClip } from './replay/photoFinish';

/** Where car states come from: the server (interpolated) or a local scenario sim. */
export interface CarSource {
  /** Fill `out` with the cars to draw at client time `now` (ms). */
  sample(now: number, out: Map<string, CarSnap>): void;
}

export type View = 'chase' | 'cockpit' | 'overview' | 'fixed';

export interface GameOptions {
  /** Settings: a small FPS counter in the corner. */
  showFps?: boolean;
  container: HTMLElement;
  tuning: Tuning;
  track: Track;
  quality: Stage['quality'];
  source: CarSource;
  view: View;
  /** Car the chase cam follows (null = first car). */
  focus: () => string | null;
  /** `view: 'fixed'`: where the camera stands and what it looks at (the garage showroom). */
  fixedCamera?: { from: readonly [number, number, number]; at: readonly [number, number, number] };
  /** How each car looks (cars.json `look`); absent = a plain hatchback. */
  lookOf?: (carId: string) => CarLook;
  /** Chaos items to draw (boxes, envelopes, puddles); null or absent = none. */
  items?: () => ItemsView | null;
  /** Is the track's sandstorm blowing right now? */
  sandstorm?: () => boolean;
  /** Race info for the cockpit dashboard (speed comes from the car itself). */
  gauges?: () => Omit<GaugeValues, 'speed'>;
  /** Who sits in each car (for bobbleheads); null/undefined = empty seats. */
  occupants?: (carId: string) => CarSeats | null;
  /** Cockpit cam: which seat you sit in (default left). */
  seatSide?: () => SeatSide;
  /** Cockpit cam: is the mouse captured for looking around? */
  mouseLocked?: () => boolean;
  /** Called at the start of every frame with the client time (ms), for per-frame stats. */
  onFrame?: (now: number) => void;
  /** Seasonal decorations beside the track and falling snow (P11.3); absent = none. */
  decorations?: { placed: readonly PlacedDecor[]; snow: boolean };
  /** Every live frame's cars as drawn (the photo-finish recorder keeps the last seconds). */
  recordCars?: (now: number, cars: ReadonlyMap<string, CarSnap>) => void;
  /** The ghost of your best lap at client time `now` (P11.1); null = none to draw. */
  lapGhost?: (now: number) => { look: CarLook; pose: GhostPose } | null;
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
/** Team slot of a car id ("car3" → 3); scenario cars use their order instead. */
function slotOf(id: string, index: number): number {
  const slot = /^car(\d+)$/.exec(id);
  return slot ? Number(slot[1]) : index;
}

function teamColor(slot: number): number {
  return TEAM_COLORS[slot % TEAM_COLORS.length] ?? TEAM_COLORS[0]!;
}

/** Look for a car the game was not told about. */
const DEFAULT_LOOK: CarLook = { body: 'hatchback', wheelScale: 1, parts: [] };

const NO_GAUGES: Omit<GaugeValues, 'speed'> = { lap: null, place: null, heat: null, stalled: false, nitro: null, item: null };
const SIDES = ['left', 'right'] as const;
const DUCK_SEAT: SeatContent = { kind: 'duck' };

/** A slow-motion replay of recorded frames from a fixed camera (photo finish, P11.2). */
export interface ReplayPlay {
  clip: ReplayClip;
  /** Clip time (ms) to play from and to, and the speed (0.4 = slow motion). */
  from: number;
  to: number;
  rate: number;
  camera: { from: readonly [number, number, number]; at: readonly [number, number, number] };
  /** Clip times that call `onMark(index)` when the replay passes them (the crossings). */
  marks: readonly number[];
  onMark(index: number): void;
  onDone(): void;
}

/** Longest frame step the camera smoothing accepts (s), so a hitch doesn't fling it. */
const MAX_FRAME_DT = 0.1;

/** The 3D race view: track, cars, camera, debug overlay. Runs its own frame loop. */
export class Game {
  private readonly stage: Stage;
  private readonly trackMeshes: TrackMeshes;
  private readonly chase: ChaseCam;
  /** Chase-cam shake after your car is hit. */
  private readonly shake = new Shake();
  private readonly cockpit: CockpitCam;
  private readonly faces = new FaceMaterials();
  // Reused every frame (no per-frame allocations).
  private readonly headOut = { yaw: 0, pitch: 0 };
  private readonly dashValues: GaugeValues = { speed: 0, ...NO_GAUGES };
  private readonly seatHead: Extract<SeatContent, { kind: 'head' }>[] = SIDES.map(() => ({ kind: 'head' as const, material: this.faces.get(''), yaw: 0, pitch: 0, hidden: false }));
  private readonly heads = new HeadSmoother();
  /** Last frame's speed and heading per car, to work out acceleration for the wobble. */
  private readonly motion = new Map<string, { speed: number; yaw: number }>();
  /** "HONK!" bubbles over cars. */
  private readonly bubbles: Bubbles;
  /** Smoke over stalled engines; drift dust/sparks and boost flames. */
  private readonly smoke: Smoke;
  private readonly sparks: Sparks;
  private readonly speedLines: SpeedLines;
  private readonly itemProps: ItemProps;
  private readonly weather: Weather;
  private readonly lapGhost: LapGhostMesh;
  private readonly decor: { group: THREE.Group; dispose(): void } | null = null;
  private readonly snow: Snowfall | null = null;
  /** Rear-view mirror (cockpit only; null when the quality preset turns it off). */
  private mirror: RearMirror | null = null;
  /** The cockpit dashboard screen (made on first use, moved to whichever car you drive). */
  private dashScreen: DashboardScreen | null = null;
  /** Car currently showing its dashboard (your car in cockpit view). */
  private dashCar: string | null = null;
  private readonly overlay: DebugOverlay;
  private readonly cars = new Map<string, CarMesh>();
  private readonly snaps = new Map<string, CarSnap>();
  private frame = 0;
  private lastTime = -1;
  private running = false;
  /** The replay playing (null = live) and when it started (client ms). */
  private replay: { play: ReplayPlay; startedAt: number; nextMark: number } | null = null;
  /** Snap the chase cam on the next frame (after a replay moved the camera away). */
  private snapNext = false;

  constructor(private readonly opts: GameOptions) {
    this.stage = createStage(opts.container, opts.tuning, opts.quality);
    this.trackMeshes = buildTrackMeshes(opts.track);
    this.stage.scene.add(this.trackMeshes.group);
    this.chase = new ChaseCam(this.stage.camera);
    this.cockpit = new CockpitCam(this.stage.camera);
    this.bubbles = new Bubbles(opts.container);
    this.smoke = new Smoke(opts.quality.particles);
    this.stage.scene.add(this.smoke.mesh);
    this.sparks = new Sparks(opts.quality.particles);
    this.stage.scene.add(this.sparks.mesh);
    this.speedLines = new SpeedLines(opts.container);
    this.itemProps = new ItemProps(buildBoxes(opts.track));
    this.weather = new Weather(this.stage.scene.fog as THREE.Fog, this.stage.scene.background as THREE.Color, opts.track.def.sandstorm);
    this.stage.scene.add(this.itemProps.group);
    this.lapGhost = new LapGhostMesh(this.stage.scene);
    if (opts.decorations && opts.decorations.placed.length > 0) {
      this.decor = buildDecorations(opts.decorations.placed);
      this.stage.scene.add(this.decor.group);
    }
    if (opts.decorations?.snow) {
      this.snow = new Snowfall(opts.quality.particles);
      this.stage.scene.add(this.snow.points);
    }
    this.overlay = new DebugOverlay(opts.container, () => ({ ...liveStats }));
    this.overlay.setShowFps(opts.showFps ?? false);
    if (opts.view === 'overview') {
      // From high above, fog would hide the whole track.
      this.stage.scene.fog = null;
      placeOverview(this.stage.camera, this.trackMeshes.bounds);
    } else if (opts.view === 'fixed' && opts.fixedCamera) {
      const { from, at } = opts.fixedCamera;
      this.stage.camera.position.set(from[0], from[1], from[2]);
      this.stage.camera.lookAt(at[0], at[1], at[2]);
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
  get head(): { readonly yaw: number; readonly pitch: number } {
    const inCockpit = this.opts.view === 'cockpit';
    this.headOut.yaw = inCockpit ? this.cockpit.headYaw : 0;
    this.headOut.pitch = inCockpit ? this.cockpit.headPitch : 0;
    return this.headOut;
  }

  /** Scenarios: run the smoke and sparks for `seconds` first, so a still picture already shows it. */
  warmEffects(seconds: number, now: number): void {
    this.opts.source.sample(now, this.snaps);
    const dt = 1 / 60;
    for (let t = seconds; t > 0; t -= dt) {
      this.smoke.update(now - t * 1000, dt, this.snaps);
      this.sparks.update(now - t * 1000, dt, this.snaps);
    }
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

  /** Show a bubble over a car (e.g. "HONK!"). */
  say(carId: string, text: string): void {
    this.bubbles.say(carId, text, performance.now());
  }

  /** Where a car is drawn right now (for sound distance). */
  carPosition(carId: string): { x: number; y: number; z: number } | undefined {
    return this.snaps.get(carId);
  }

  /** Where the camera is (for sound distance). */
  get cameraPosition(): THREE.Vector3 {
    return this.stage.camera.position;
  }

  /** Settings changed: show or hide the FPS counter. */
  setShowFps(on: boolean): void {
    this.overlay.setShowFps(on);
  }

  /** Something jolted your car (wall, landing, bump): shake the cockpit head or the chase cam a little. */
  bump(strength: number): void {
    this.cockpit.bump(strength, this.opts.tuning.camera);
    this.shake.hit(strength);
  }

  /** Any car hit something or landed at `impact` m/s: its heads bob, a landing squashes it. */
  jolt(carId: string, impact: number, landing: boolean): void {
    this.cars.get(carId)?.jolt(impact, landing);
  }

  /** A car crossed the finish line: confetti over it (lots more when it is yours). */
  confetti(carId: string, mine: boolean): void {
    const p = this.snaps.get(carId);
    if (p) this.sparks.confetti(p.x, p.y, p.z, JUICE.confettiPieces * (mine ? JUICE.confettiMine : 1));
  }

  /** Play recorded frames in slow motion from a fixed camera, then go back to live. */
  playReplay(play: ReplayPlay, now: number): void {
    this.replay = { play, startedAt: now, nextMark: 0 };
  }

  /** Stop a replay early (the race ended). */
  stopReplay(): void {
    if (!this.replay) return;
    const { play } = this.replay;
    this.replay = null;
    this.snapNext = true;
    play.onDone();
  }

  get replaying(): boolean {
    return this.replay !== null;
  }

  /** Jump straight to full sandstorm (or clear), skipping the fade (`sandstorm` scenario). */
  snapWeather(stormOn: boolean): void {
    this.weather.update(stormOn, Number.POSITIVE_INFINITY);
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
    // Count draw calls over the whole frame (mirror pass + main pass), not just the last render.
    this.stage.renderer.info.reset();
    this.opts.source.sample(now, this.snaps);
    if (!this.replay) this.opts.recordCars?.(now, this.snaps);
    const replay = this.stepReplay(now);
    this.syncCars(dt);
    const ghost = replay ? null : (this.opts.lapGhost?.(now) ?? null);
    this.lapGhost.update(ghost?.look ?? null, ghost?.pose ?? null, dt);
    this.heads.sweep();
    this.smoke.update(now, dt, this.snaps);
    this.sparks.update(now, dt, this.snaps);
    this.itemProps.update(now, this.opts.items?.() ?? null, this.snaps);
    this.weather.update(this.opts.sandstorm?.() ?? false, dt);

    const view = this.opts.view;
    if (replay) {
      const { from, at } = replay.camera;
      const cam = this.stage.camera;
      cam.position.set(from[0], from[1], from[2]);
      cam.lookAt(at[0], at[1], at[2]);
      // The plain field of view (not the cockpit's or a speed-widened one).
      if (cam.fov !== this.opts.tuning.camera.fov) {
        cam.fov = this.opts.tuning.camera.fov;
        cam.updateProjectionMatrix();
      }
      this.setBackdrop(false);
      this.showDash(null);
      this.speedLines.update(0);
    } else if (view === 'chase' || view === 'cockpit') {
      const id = this.opts.focus() ?? this.snaps.keys().next().value ?? null;
      const car = id === null ? undefined : this.snaps.get(id);
      const cam = this.opts.tuning.camera;
      // No car to follow (empty lobby, everyone watching): show the whole track instead of a
      // camera stuck at the origin; switch back the moment a car appears.
      this.setBackdrop(car === undefined);
      if (car && view === 'cockpit') {
        const locked = this.opts.mouseLocked?.() ?? false;
        this.cockpit.update(cam, car.x, car.y, car.z, car.yaw, this.opts.seatSide?.() ?? 'left', dt, locked, this.cars.get(id!)?.cockpitLift);
      } else if (car) {
        this.chase.update(cam, car.x, car.y, car.z, car.yaw, dt, snapCamera || this.snapNext, car.speed / this.opts.tuning.car.topSpeed);
        this.snapNext = false;
        this.shake.step(dt);
        if (this.shake.amp > 0) {
          this.stage.camera.translateX(this.shake.x);
          this.stage.camera.translateY(this.shake.y);
        }
      }
      this.showDash(view === 'cockpit' && id !== null ? id : null);
      const lift = id === null ? undefined : this.cars.get(id)?.cockpitLift;
      if (view === 'cockpit' && car && this.mirror) {
        this.mirror.mesh.position.set(0, car.y + (lift?.y ?? 0), lift?.z ?? 0);
        this.mirror.render(this.stage.renderer, this.stage.scene, car.x, car.y, car.z, car.yaw, lift?.y ?? 0);
      }
      if (view === 'cockpit' && car && this.dashScreen) {
        this.dashScreen.mesh.position.set(0, car.y + (lift?.y ?? 0), lift?.z ?? 0);
        Object.assign(this.dashValues, this.opts.gauges?.() ?? NO_GAUGES);
        this.dashValues.speed = car.speed;
        this.dashScreen.update(now, this.dashValues);
      }
      focusPose.set = car !== undefined;
      otherPose.set = false;
      for (const [otherId, other] of this.snaps) {
        if (otherId === id) continue;
        otherPose.set = true;
        otherPose.x = other.x;
        otherPose.z = other.z;
        otherPose.speed = other.speed;
        break;
      }
      this.speedLines.update(car ? speedLineStrength(car.speed / this.opts.tuning.car.topSpeed, car.boosting || car.nitroOn) : 0);
      if (car) {
        focusPose.x = car.x;
        focusPose.z = car.z;
        focusPose.yaw = car.yaw;
        focusPose.speed = car.speed;
        focusPose.drift = car.drift;
        focusPose.boosting = car.boosting || car.nitroOn;
        focusPose.camX = this.stage.camera.position.x;
        focusPose.camZ = this.stage.camera.position.z;
      }
    }

    const { renderer, scene, camera } = this.stage;
    this.snow?.update(dt, camera.position.x, camera.position.z);
    renderer.render(scene, camera);
    this.bubbles.update(now, camera, this.opts.container.clientWidth, this.opts.container.clientHeight, (id) => this.snaps.get(id));
    const info = renderer.info;
    liveStats.drawCalls = info.render.calls;
    liveStats.triangles = info.render.triangles;
    liveStats.geometries = info.memory.geometries;
    liveStats.textures = info.memory.textures;
    liveStats.cars = this.cars.size;
    this.overlay.update(now);
  }

  /** Replay time for this frame: puts the recorded cars in `snaps`; null when live. */
  private stepReplay(now: number): ReplayPlay | null {
    const r = this.replay;
    if (!r) return null;
    const t = r.play.from + (now - r.startedAt) * r.play.rate;
    while (r.nextMark < r.play.marks.length && t >= r.play.marks[r.nextMark]!) r.play.onMark(r.nextMark++);
    if (t > r.play.to) {
      this.stopReplay();
      return null;
    }
    sampleClip(r.play.clip, t, this.snaps);
    return r.play;
  }

  /** Showing the track overview because there is no car to follow. */
  private backdrop = false;
  private sceneFog: THREE.Fog | THREE.FogExp2 | null = null;

  private setBackdrop(on: boolean): void {
    if (on === this.backdrop) return;
    this.backdrop = on;
    const { scene, camera } = this.stage;
    if (on) {
      // From high above, fog would hide the whole track.
      this.sceneFog = scene.fog;
      scene.fog = null;
      placeOverview(camera, this.trackMeshes.bounds);
    } else {
      scene.fog = this.sceneFog;
      camera.near = CAMERA_NEAR;
      camera.far = LIGHT.fogFar * 2;
      camera.updateProjectionMatrix(); // the chase/cockpit cams set the fov themselves
    }
  }

  /** Only your own car, only in the cockpit, shows its dashboard (block + screen). */
  private showDash(id: string | null): void {
    if (id === this.dashCar) {
      if (id) this.cars.get(id)?.setCockpit(true); // keep it on the car (height follows jumps)
      return;
    }
    if (this.dashCar) this.cars.get(this.dashCar)?.setCockpit(false);
    this.dashScreen?.mesh.removeFromParent();
    this.mirror?.mesh.removeFromParent();
    this.dashCar = id;
    const car = id ? this.cars.get(id) : undefined;
    if (car) {
      car.setCockpit(true);
      this.dashScreen ??= new DashboardScreen();
      car.root.add(this.dashScreen.mesh);
      if (this.opts.quality.mirror !== 'off') {
        this.mirror ??= new RearMirror(this.opts.quality.mirror);
        car.root.add(this.mirror.mesh);
      }
    }
  }

  /** Bobbleheads / duck for one car, wobbling with its acceleration. */
  private updateSeats(id: string, mesh: CarMesh, s: CarSnap, dt: number): void {
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
    // A replay looks at the cars from outside: your own head shows too.
    const inCockpit = this.opts.view === 'cockpit' && this.replay === null;
    for (let i = 0; i < SIDES.length; i++) {
      const side = SIDES[i]!;
      const who = seats?.[side] ?? null;
      let content: SeatContent = null;
      if (who === 'duck') content = DUCK_SEAT;
      else if (who) {
        const head = this.heads.step(who.id, who.yaw, who.pitch, dt);
        const c = this.seatHead[i]!;
        c.material = this.faces.get(who.face);
        c.yaw = head.yaw;
        c.pitch = head.pitch;
        c.hidden = who.me && inCockpit;
        content = c;
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
      const look = this.opts.lookOf?.(id) ?? DEFAULT_LOOK;
      if (mesh && mesh.lookKey !== lookKeyOf(look)) {
        // The team picked another car: build the new one.
        mesh.dispose();
        this.cars.delete(id);
        mesh = undefined;
      }
      if (!mesh) {
        const slot = slotOf(id, this.cars.size);
        mesh = new CarMesh(look, teamColor(slot), slot + 1);
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
    this.bubbles.dispose();
    this.faces.dispose();
    this.smoke.dispose();
    this.sparks.dispose();
    this.speedLines.dispose();
    this.itemProps.dispose();
    this.lapGhost.dispose();
    this.decor?.dispose();
    this.snow?.dispose();
    this.dashScreen?.dispose();
    this.mirror?.dispose();
    this.trackMeshes.dispose();
    this.stage.dispose();
  }
}
