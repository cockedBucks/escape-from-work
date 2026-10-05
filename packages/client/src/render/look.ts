// Visual-only constants: colors from docs/ART_STYLE.md and greybox proportions.
// Gameplay numbers never live here (they come from config/). These only change looks.

/** Palette (ART_STYLE §3). */
export const PALETTE = {
  sand: 0xf4ebdc,
  road: 0x3d4a5c,
  line: 0xfff6d6,
  curbRed: 0xe63946,
  carpet: 0x8c9bb0,
  desk: 0xe9d8b4,
  cubicle: 0x8aa0b8,
  plant: 0x4caf50,
  metal: 0xd9dde3,
  glass: 0xbfe3f2,
  tire: 0x2b2b2b,
  uiDark: 0x1e2230,
} as const;

/** Team colors in slot order (ART_STYLE §3). */
export const TEAM_COLORS: readonly number[] = [
  0xe63946, 0x1d7fe0, 0xffb703, 0x2a9d8f, 0x9b5de5, 0xfb8500, 0x06d6a0, 0xf15bb5,
];

/** Lighting (ART_STYLE §2: one hemisphere + one warm sun, light fog). */
export const LIGHT = {
  /** Sky and fog color: light blue so the horizon reads against the sand ground. */
  sky: 0xbfe3f2,
  skyColor: 0xfff4e0,
  groundColor: 0xc9b89a,
  hemiIntensity: 1.6,
  sunColor: 0xffe2b8,
  sunIntensity: 1.8,
  /** Sun direction (from the sun toward the scene), not normalized. */
  sunDir: [-0.5, -1, -0.35] as const,
  fogNear: 140,
  fogFar: 420,
} as const;

/** Greybox track proportions (m). */
export const TRACK_LOOK = {
  wallHeight: 1.1,
  wallThickness: 0.5,
  curbWidth: 0.9,
  /** Curbs alternate red/white every this many samples. */
  curbStripeSamples: 2,
  /** Only draw curbs where the road curves at least this much (1/m). */
  curbMinCurvature: 1 / 60,
  startLineWidth: 1.2,
  rampHeight: 0.7,
  /** Slick patch tint and opacity. */
  slickColor: 0x7fc8e8,
  slickOpacity: 0.65,
  /** Swap lane: purple/white stripes over its half of the road, this many samples per stripe. */
  swapColors: [0x9b5de5, 0xffffff],
  swapStripeSamples: 2,
  swapOpacity: 0.7,
  /** Ground plane extends this far past the track bounds (m). */
  groundMargin: 400,
  /** Small lift so flat decals never z-fight with the road (m). */
  decalLift: 0.02,
} as const;

/** Placeholder box car (P7 replaces it with the car kit). Sizes in meters. */
export const BOX_CAR = {
  length: 3.6,
  width: 1.9,
  bodyHeight: 0.6,
  /** Height of the bottom of the body above the ground. */
  ride: 0.35,
  cabinLength: 1.8,
  cabinHeight: 0.55,
  /** Cabin sits this far behind the body center. */
  cabinBack: 0.35,
  wheelRadius: 0.48,
  wheelWidth: 0.42,
  /** Wheel centers from the car center: forward/back and sideways. */
  wheelBase: 1.2,
  wheelTrack: 0.95,
  /** Visual front-wheel turn at full steering (rad). */
  maxWheelTurn: 0.5,
  shadowRadius: 1.6,
  shadowOpacity: 0.28,
  /** Opacity of a ghosted (just respawned) car. */
  ghostOpacity: 0.45,
} as const;

/** Cockpit: eye position in the box car (m) and the dashboard block in front of you. */
export const COCKPIT = {
  /** Sideways from the car center to each seat. */
  seatOffset: 0.42,
  /** Seats sit this far behind the car center. */
  seatBack: 0.45,
  /** Eye height above the top of the body (inside the cabin). */
  eyeAboveBody: 0.38,
  dashDepth: 0.22,
  dashHeight: 0.1,
  /** Dashboard front edge, ahead of the car center (the windshield line). */
  dashForward: 0.55,
  /** Windshield frame: pillar and roof-bar thickness. */
  frameThickness: 0.07,
  dashColor: 0x2b2b2b,
} as const;

/** The cockpit dashboard screen (a tilted panel on top of the dashboard). */
export const DASH_SCREEN = {
  /** Panel width (m); height is a quarter of it. */
  width: 0.9,
  /** Canvas resolution across (px). */
  pixelsWide: 512,
  /** Lean back toward the driver (rad). */
  tilt: 0.9,
  /** Lift above the dashboard top (m). */
  raise: 0.06,
} as const;

/** Rear-view mirror (cockpit): panel size and placement (m), texture size (px), view. */
export const MIRROR = {
  width: 0.5,
  /** Height as a fraction of the width. */
  aspectHeight: 0.25,
  /** Low resolution on purpose (ART_STYLE §7). */
  pixelsWide: 256,
  fov: 40,
  /** How far back the mirror camera can see (m). */
  far: 150,
  /** Panel: just below the roof line, centered. */
  below: 0.12,
  offsetX: 0,
  /** Width of the dark frame around the mirror (m). */
  frame: 0.025,
  /** Mirror camera: above the roof and a bit behind the car center, so it sees past the heads. */
  cameraAbove: 0.5,
  cameraBack: 1.9,
} as const;

/** Bobbleheads (ART_STYLE §4: heads ~1.6× scale, on a spring, wobbling). */
export const HEAD = {
  radius: 0.36,
  /** Head center height above the car's ground point (pokes up through the roof). */
  centerY: 1.82,
  /** Wrap-around face texture width in px (height is half). Faces ≤ 256 px tall. */
  textureWidth: 512,
  /** The non-face part of the head (a light helmet) and the placeholder face color. */
  helmetColor: '#d9dde3',
  placeholderSkin: '#f6d7b0',
  /**
   * Photo framing in the face oval, as fractions of the oval's half-height from its center
   * (− = up): every photo is scaled and moved so its eyes and chin land here. Photos without
   * framing in faces.json assume a typical portrait: eyes 40% and chin 80% down the photo.
   */
  ovalEyes: -0.1,
  ovalChin: 0.85,
  photoEyes: 0.4,
  photoChin: 0.8,
  /** Wobble spring: stiffness (1/s), damping ratio (<1 = bouncy), tilt per m/s² and max tilt (rad). */
  wobbleStiffness: 9,
  wobbleDamping: 0.35,
  wobblePerAccel: 0.03,
  wobbleMax: 0.6,
} as const;

/** The rubber duck in a solo car's empty seat. */
export const DUCK = {
  bodyRadius: 0.26,
  headRadius: 0.15,
  /** Sits on the roof above its seat, like the heads (center height, m). */
  y: 1.72,
  yellow: 0xffd23f,
  orange: 0xfb8500,
} as const;

/** Top-down overview camera: field of view and empty border around the track (1.1 = 10%). */
export const OVERVIEW = {
  fov: 50,
  margin: 1.1,
  /** Near/far planes as fractions of the camera height. */
  nearFraction: 0.5,
  farFraction: 1.5,
} as const;

/** Smoke from a stalled engine (ART_STYLE: chunky low-poly puffs, no textures). */
export const SMOKE = {
  /** Most puffs alive at once (all cars); one instanced draw call. */
  maxPuffs: 64,
  /** A stalled car puffs this often (ms); "reduced" particles puff half as often. */
  emitEveryMs: 80,
  lifeSeconds: 1.3,
  /** Rise speed (m/s) and random sideways drift (m/s). */
  rise: 2,
  drift: 0.5,
  /** Puff radius: starts small, swells to `peakSize` at a third of its life, shrinks to 0. */
  startSize: 0.2,
  peakSize: 0.9,
  color: 0x6f757e,
  /** Where on the car it comes out: in front of the cabin, above the hood (m from the car's center). */
  forward: 1.2,
  height: 1.05,
} as const;

/** Drift dust and sparks, boost flames (ART_STYLE §6): bright unlit chips, one instanced draw call. */
export const SPARKS = {
  maxParticles: 192,
  /** A drifting car throws particles from each rear wheel this often (ms); boosting cars flame as often. */
  driftEveryMs: 20,
  boostEveryMs: 30,
  /** Rear wheels: this far behind the car's center and to each side (m), at this height. */
  rearBack: 1.3,
  rearSide: 0.95,
  rearHeight: 0.25,
  /** Colors: dust while a drift charges (level 0), then blue → orange → pink; flames. */
  dust: 0xd8c9ad,
  levels: [0x1d7fe0, 0xfb8500, 0xf15bb5],
  flames: [0xffb703, 0xfb8500],
  /** Size (m), life (s), backward throw and upward kick (m/s), gravity (m/s²) per kind. */
  dustSize: 0.4,
  dustLife: 0.5,
  sparkSize: 0.26,
  sparkLife: 0.35,
  flameSize: 0.38,
  flameLife: 0.22,
  throwBack: 3,
  kickUp: 4,
  flameBack: 7,
  /** Nitro flames are this much bigger and longer than a drift boost's. */
  nitroFlameScale: 1.8,
  gravity: 14,
} as const;
