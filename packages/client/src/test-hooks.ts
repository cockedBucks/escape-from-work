// Test hooks for /shots and agents: `?scenario=` handling and `window.__game`
// (docs/ARCHITECTURE.md §9, docs/TESTING.md "Shots").

export interface GameStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  cars: number;
  /** Server sim tick cost; null until the server reports it. */
  tickMs: number | null;
  /** Round trip to the game server; null until measured. */
  pingMs: number | null;
  /** Time since the latest server snapshot arrived; null until one has. */
  snapshotAgeMs: number | null;
  /** Key press until the server state that applied it arrives (smoothed); null until measured. */
  inputDelayMs: number | null;
  /** Interpolation delay added on top before it is drawn (adapts to the network, P13.1). */
  interpDelayMs: number | null;
  /** 95th-percentile lateness of server snapshots (ms): the network's jitter; null until measured. */
  jitterMs: number | null;
  /** Share of frames (%) that ran past the newest snapshot (other cars extrapolated). */
  starvedPct: number | null;
}

export interface GameHooks {
  /** True once the scene has rendered stable frames and a screenshot is meaningful. */
  ready: boolean;
  scenario: string | null;
  seed: number;
  /** Set when the page cannot show the requested scenario; /shots fails fast on it. */
  error: string | null;
  stats(): GameStats;
  /** Pose of the car the camera follows, as drawn this frame (null when none). For agents/tests. */
  focusCar(): { x: number; z: number; yaw: number; speed: number; camX: number; camZ: number } | null;
  /** Drawn pose of another car (the first one that is not followed), for the smoothness test. */
  otherCar(): { x: number; z: number; speed: number } | null;
}

declare global {
  interface Window {
    __game: GameHooks;
  }
}

/** Every `?scenario=` the client can show. New screens add theirs (docs/TESTING.md). */
export const KNOWN_SCENARIOS: readonly string[] = ['hello', 'chase', 'ghost', 'cockpit', 'juice', 'stall', 'drift', 'nitro', 'countdown', 'sandstorm', 'items', 'garage', 'photo', 'props', 'pad', 'shortcut', 'track-overview', 'menu', 'league', 'host', 'join', 'lobby', 'carpick', 'results'];

const DEFAULT_SEED = 1;

export function parseScenario(search: string): { scenario: string | null; seed: number } {
  const params = new URLSearchParams(search);
  const scenario = params.get('scenario');
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  return { scenario: scenario === '' ? null : scenario, seed: Number.isFinite(seed) ? seed : DEFAULT_SEED };
}

/** Live values behind `stats()`. The renderer and net code write here (no per-frame allocation);
 *  `stats()` itself returns a copy, which is fine for occasional test calls. */
export const liveStats: GameStats = {
  fps: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  cars: 0,
  tickMs: null,
  pingMs: null,
  snapshotAgeMs: null,
  inputDelayMs: null,
  interpDelayMs: null,
  jitterMs: null,
  starvedPct: null,
};

/** Drawn pose of the followed car; the game writes it every frame (no allocation). */
export const focusPose = { set: false, x: 0, z: 0, yaw: 0, speed: 0, camX: 0, camZ: 0, drift: 0, boosting: false };

/** Drawn pose of the first car that is not followed; the game writes it every frame. */
export const otherPose = { set: false, x: 0, z: 0, speed: 0 };

/** Weight of the newest frame in the smoothed frame time (exponential moving average). */
const FPS_SMOOTHING = 0.1;

/** Smoothed frame time, so fps is meaningful after two frames (no 1 s window to fill). */
function countFps(): void {
  let last = -1;
  let avgMs = 0;
  const tick = (now: number): void => {
    if (last >= 0) {
      const dt = now - last;
      avgMs = avgMs === 0 ? dt : avgMs + (dt - avgMs) * FPS_SMOOTHING;
      if (avgMs > 0) liveStats.fps = Math.round(1000 / avgMs);
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function installHooks(): GameHooks {
  const { scenario, seed } = parseScenario(window.location.search);
  const hooks: GameHooks = {
    ready: false,
    scenario,
    seed,
    error: null,
    stats: () => ({ ...liveStats }),
    focusCar: () =>
      focusPose.set ? { x: focusPose.x, z: focusPose.z, yaw: focusPose.yaw, speed: focusPose.speed, camX: focusPose.camX, camZ: focusPose.camZ } : null,
    otherCar: () => (otherPose.set ? { x: otherPose.x, z: otherPose.z, speed: otherPose.speed } : null),
  };
  if (scenario !== null && !KNOWN_SCENARIOS.includes(scenario)) {
    hooks.error = `unknown scenario "${scenario}" (known: ${KNOWN_SCENARIOS.join(', ')})`;
  }
  window.__game = hooks;
  countFps();
  return hooks;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Mark ready after fonts are loaded and two more frames have been drawn. */
export async function markReady(hooks: GameHooks): Promise<void> {
  await document.fonts.ready;
  await nextFrame();
  await nextFrame();
  hooks.ready = true;
}
