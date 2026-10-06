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
  /** Dashed center line (sense of speed): dash and gap length (m), width (m). */
  centerDash: 3,
  centerGap: 5,
  centerWidth: 0.25,
  /** Roadside posts every `postSpacing` m on both edges, `postOut` m outside the road; red/white. */
  postSpacing: 12,
  postOut: 1.2,
  postSize: 0.3,
  postHeight: 1.3,
  /** Swap lane: purple/white stripes over its half of the road, this many samples per stripe. */
  swapColors: [0x9b5de5, 0xffffff],
  swapStripeSamples: 2,
  swapOpacity: 0.7,
  /** Ground plane extends this far past the track bounds (m). */
  groundMargin: 400,
  /** The ground is pushed back in depth by this much (polygon offset), so the road always wins over it. */
  groundDepthOffset: 4,
  /** Ground color per track theme (anything else: sand). */
  groundByTheme: { office: PALETTE.carpet } as Readonly<Record<string, number>>,
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
  /** Eye height above the top of the body (inside the cabin) — the box car's; kit cars move the
   * eye to their head (`eyeAboveHead` m above its center) and the dash with it (`CarMesh.cockpitLift`). */
  eyeAboveBody: 0.38,
  eyeAboveHead: 0.08,
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
  maxParticles: 320,
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
  /** Random spread: backward throw × (min + rand × range), sideways ±1 m/s, dust kicks up only
   * `dustKick` of a spark's kick; flames rise a little and vary in size. */
  throwMin: 0.5,
  throwRange: 1,
  sparkKickMin: 0.5,
  dustKick: 0.3,
  flameRise: 0.5,
  flameSizeMin: 0.7,
  flameSizeRange: 0.6,
  /** Nitro flames are this much bigger and longer than a drift boost's. */
  nitroFlameScale: 1.8,
  gravity: 14,
} as const;

/** Juice (ART_STYLE §6): landing squash, hit shake, head kicks on bumps, finish confetti. */
export const JUICE = {
  /** Landing squash: body height lost per m/s of landing speed (capped), spring (1/s, damping ratio), and how much wider it gets. */
  squashPerImpact: 0.035,
  squashMax: 0.3,
  squashStiffness: 16,
  squashDamping: 0.32,
  squashWiden: 0.5,
  /** Springs and shakes this small count as stopped; springs step at most this much at a time (s). */
  restEpsilon: 0.002,
  maxStep: 1 / 120,
  /** Chase-cam shake: meters per m/s of impact (capped), fade (1/s), wobble rates (rad/s). */
  shakePerImpact: 0.02,
  shakeMax: 0.4,
  shakeDecay: 8,
  shakeFreqA: 41,
  shakeFreqB: 33,
  /** Bobbleheads: tilt speed kick (rad/s) per m/s of a hit or landing, capped. */
  headKickPerImpact: 0.4,
  headKickMax: 7,
  /** Finish confetti: pieces per burst (your own finish: × `confettiMine`), launch speeds (m/s), life (s), fall (m/s²), size (m), start height (m). */
  confettiPieces: 36,
  confettiMine: 3,
  confettiUp: 8,
  confettiSpread: 5,
  confettiLife: 2.4,
  confettiFall: 7,
  confettiSize: 0.2,
  confettiHeight: 1.5,
  confettiColors: [0xff5a5f, 0xffd23f, 0x3bceac, 0x5b8cff, 0xc77dff, 0xffffff],
} as const;

/** Main menu showroom (P8.1): a car spinning on a turntable, swapped every few seconds. */
export const SHOWROOM = {
  /** Turntable disc radius and thickness (m), spin (rad/s), seconds per car. */
  tableRadius: 3.6,
  tableHeight: 0.18,
  spin: 0.6,
  carSeconds: 4,
  /** Camera: distance and height from the car, where it looks, and how far left the car sits
   * on screen (m; the menu buttons are on the left). */
  camDistance: 7.2,
  camHeight: 2.6,
  lookHeight: 0.7,
  lookLeft: 1.4,
  /** A new car drops onto the table: landing speed for the squash (m/s). */
  dropImpact: 9,
  tableColor: 0xe9c46a,
  tableRim: 0x1e2230,
  /** Office carpet around the table (m). */
  floorRadius: 120,
} as const;

/** Chaos items in the world (ART_STYLE: chunky, bright, readable from the chase cam). */
export const ITEM_LOOK = {
  /** Mystery Packet boxes: size (m), hover height, spin (rad/s), bob height (m) and rate (rad/s). */
  boxSize: 1.1,
  boxHeight: 1.0,
  boxSpin: 1.6,
  boxBob: 0.15,
  boxBobRate: 2.4,
  boxColor: '#ffb703',
  boxEdge: '#1e2230',
  boxTextureSize: 128,
  /** Reply-All envelope (m), flying height. */
  mailWidth: 0.9,
  mailHeight: 0.12,
  mailLength: 0.6,
  mailColor: 0xffffff,
  mailFlyHeight: 0.8,
  /** Envelopes keep flying this long past the last patch (ms). */
  maxExtrapolateMs: 120,
  /** Coffee puddle: radius (m, matches items.coffeeSpill.radius roughly), lift, color. */
  puddleRadius: 2.4,
  puddleLift: 0.04,
  puddleSegments: 12,
  coffeeColor: 0x6f4e37,
  /** Pools: envelopes/puddles of each kind, Firewall bubbles. */
  maxShots: 24,
  maxShields: 8,
  /** Firewall bubble around a car. */
  shieldRadius: 2.3,
  shieldHeight: 0.9,
  shieldSpin: 0.8,
  shieldColor: 0x2a9d8f,
  shieldOpacity: 0.35,
} as const;

/** Car kit body presets (ART_STYLE §4): proportions in meters. `cabinZ` = cabin center from
 * the car center (+ = forward); heads sit in the cabin, poking through its roof. */
export const CAR_BODIES = {
  hatch: { length: 3.6, width: 1.9, body: 0.6, ride: 0.35, cabinLength: 1.8, cabinHeight: 0.6, cabinZ: -0.35, wheelBase: 1.2 },
  sedan: { length: 4.1, width: 1.9, body: 0.55, ride: 0.35, cabinLength: 2.0, cabinHeight: 0.6, cabinZ: -0.2, wheelBase: 1.4 },
  pickup: { length: 4.4, width: 1.95, body: 0.6, ride: 0.45, cabinLength: 1.5, cabinHeight: 0.65, cabinZ: 0.5, wheelBase: 1.45 },
  van: { length: 4.0, width: 2.0, body: 0.7, ride: 0.35, cabinLength: 3.0, cabinHeight: 0.8, cabinZ: -0.3, wheelBase: 1.35 },
  mini: { length: 2.8, width: 1.7, body: 0.55, ride: 0.4, cabinLength: 1.6, cabinHeight: 0.65, cabinZ: -0.2, wheelBase: 0.95 },
  round: { length: 3.4, width: 1.85, body: 0.6, ride: 0.35, cabinLength: 1.8, cabinHeight: 0.7, cabinZ: -0.2, wheelBase: 1.15 },
  muscle: { length: 4.5, width: 2.0, body: 0.5, ride: 0.32, cabinLength: 1.5, cabinHeight: 0.52, cabinZ: -0.85, wheelBase: 1.55 },
} as const;

/** Car kit look rules: shared sizes and the trim/part colors (team paint comes from the slot). */
export const CAR_KIT = {
  wheelRadius: 0.48,
  wheelWidth: 0.42,
  wheelSegments: 14,
  /** Low-poly round shapes (the "round" body, dish, key). */
  roundSegments: 10,
  /** Heads poke this share of their radius above the cabin roof. */
  headAboveRoof: 0.85,
  /** Roof slab thickness (team color) on top of the glass cabin. */
  roofThickness: 0.08,
  trim: 0x1e2230,
  glass: 0xbfe3f2,
  metal: 0xd9dde3,
  light: 0xfff6d6,
  tail: 0xe63946,
  signYellow: 0xffb703,
  /** Roof number decal: size (m) and the atlas (8 numbers in a row, px per number). */
  numberSize: 0.75,
  numberPx: 64,
  /** Blob shadow radius as a share of the car's length (or width, if wider). */
  shadowShare: 0.45,
} as const;

/** Car kit trim and part dimensions (m; shares are of the car's width or cabin length). */
export const CAR_PARTS_LOOK = {
  bumper: { height: 0.2, depth: 0.18, lift: 0.12, widthShare: 1.02 },
  headlight: { width: 0.36, height: 0.14, sideShare: 0.62, heightShare: 0.62 },
  taillight: { width: 0.3, height: 0.12, sideShare: 0.66 },
  lightDepth: 0.06,
  /** Heads sit this share of the cabin length forward of its center; roof parts this share behind its back. */
  seatForward: 0.15,
  roofPartBack: 0.22,
  spoiler: { heightOverRoof: 1.35, back: 0.3, post: 0.1, postSideShare: 0.55, wingWidthShare: 1.08, wingThick: 0.08, wingDepth: 0.5 },
  roofSign: { widthShare: 0.62, height: 0.5, depth: 0.55, stripe: 0.1 },
  roofBox: { widthShare: 0.8, height: 0.5, lengthShare: 0.5 },
  dish: { post: 0.05, postHeight: 0.4, radius: 0.55, rim: 0.15, thick: 0.12, tilt: -0.6, sideShare: 0.4 },
  ladder: { rail: 0.06, gap: 0.18, rungWidth: 0.42, rungs: 6, sideShare: -0.45, lengthShare: 0.9 },
  speakers: { width: 0.7, height: 0.9, depth: 0.6, cone: 0.22, sideShare: 0.45, behindCabin: 0.55 },
  hoodScoop: { widthShare: 0.36, height: 0.24, length: 0.8 },
  windupKey: { shaft: 0.06, shaftLength: 0.5, wingWidth: 0.42, wingHeight: 0.28, wingThick: 0.06, heightShare: 0.8 },
} as const;

/**
 * Office prop kit (ART_STYLE §5). Sizes are real office sizes in meters; the whole office is
 * drawn `officeScale` times bigger so desks and printers read next to the toy-sized cars.
 */
export const PROP_LOOK = {
  officeScale: 2,
  roundSegments: 8,
  wood: 0xe9d8b4,
  cubicle: 0x8aa0b8,
  plant: 0x4caf50,
  metal: 0xd9dde3,
  glass: 0xbfe3f2,
  dark: 0x1e2230,
  white: 0xffffff,
  screen: 0x3d6fa8,
  pot: 0xd9734e,
  accent: 0xe63946,
  doodles: [0x1d7fe0, 0xe63946, 0x06d6a0],
} as const;

/** A prop primitive: box [w, h, d], cylinder [radius, height] or blob (ellipsoid) [rx, ry, rz]. */
export interface PropPrim {
  s: 'box' | 'cyl' | 'blob';
  size: readonly number[];
  at: readonly [number, number, number];
  color: keyof typeof PROP_COLORS;
}
export const PROP_COLORS = {
  wood: PROP_LOOK.wood, cubicle: PROP_LOOK.cubicle, plant: PROP_LOOK.plant, metal: PROP_LOOK.metal,
  glass: PROP_LOOK.glass, dark: PROP_LOOK.dark, white: PROP_LOOK.white, screen: PROP_LOOK.screen,
  pot: PROP_LOOK.pot, accent: PROP_LOOK.accent, blue: 0x1d7fe0, mint: 0x06d6a0,
} as const;

const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: keyof typeof PROP_COLORS): PropPrim => ({ s: 'box', size: [w, h, d], at: [x, y, z], color });
const cyl = (r: number, h: number, x: number, y: number, z: number, color: keyof typeof PROP_COLORS): PropPrim => ({ s: 'cyl', size: [r, h], at: [x, y, z], color });
const blob = (rx: number, ry: number, rz: number, x: number, y: number, z: number, color: keyof typeof PROP_COLORS): PropPrim => ({ s: 'blob', size: [rx, ry, rz], at: [x, y, z], color });

/** Every office prop as primitives at real size (m; +Z = its front). */
export const PROP_SHAPES = {
  desk: [
    box(1.6, 0.05, 0.8, 0, 0.74, 0, 'wood'),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.05, 0.72, 0.05, sx * 0.75, 0.36, sz * 0.35, 'metal'))),
    box(0.4, 0.5, 0.7, 0.55, 0.47, 0, 'wood'),
    // A workstation: monitor and keyboard on top.
    box(0.62, 0.4, 0.05, 0, 1.03, -0.2, 'dark'),
    box(0.56, 0.34, 0.01, 0, 1.03, -0.17, 'screen'),
    box(0.05, 0.12, 0.05, 0, 0.82, -0.22, 'metal'),
    box(0.45, 0.03, 0.15, 0, 0.78, 0.15, 'dark'),
  ],
  chair: [
    box(0.5, 0.08, 0.5, 0, 0.48, 0, 'dark'),
    box(0.48, 0.55, 0.06, 0, 0.8, -0.24, 'dark'),
    cyl(0.03, 0.4, 0, 0.26, 0, 'metal'),
    cyl(0.3, 0.05, 0, 0.05, 0, 'dark'),
  ],
  cubicle: [
    box(1.8, 1.4, 0.08, 0, 0.7, 0, 'cubicle'),
    box(1.82, 0.06, 0.1, 0, 1.42, 0, 'metal'),
    ...[-1, 1].map((sx) => box(0.08, 0.04, 0.4, sx * 0.8, 0.02, 0, 'metal')),
  ],
  monitor: [
    box(0.62, 0.4, 0.05, 0, 0.42, 0, 'dark'),
    box(0.56, 0.34, 0.01, 0, 0.42, 0.03, 'screen'),
    box(0.05, 0.2, 0.05, 0, 0.15, -0.02, 'metal'),
    box(0.25, 0.03, 0.18, 0, 0.015, 0, 'metal'),
  ],
  keyboard: [box(0.45, 0.03, 0.15, 0, 0.015, 0, 'dark'), box(0.42, 0.01, 0.12, 0, 0.035, 0, 'white')],
  printer: [
    box(0.6, 0.45, 0.5, 0, 0.225, 0, 'metal'),
    box(0.5, 0.05, 0.4, 0, 0.47, 0, 'dark'),
    box(0.4, 0.04, 0.25, 0, 0.3, 0.3, 'white'),
    box(0.3, 0.01, 0.2, 0, 0.33, 0.32, 'white'),
    box(0.06, 0.04, 0.02, 0.2, 0.4, 0.26, 'accent'),
  ],
  waterCooler: [
    box(0.35, 0.95, 0.35, 0, 0.475, 0, 'white'),
    cyl(0.15, 0.45, 0, 1.18, 0, 'glass'),
    box(0.06, 0.05, 0.06, 0, 0.75, 0.19, 'accent'),
  ],
  coffeeMachine: [
    box(0.35, 0.5, 0.35, 0, 0.25, 0, 'dark'),
    box(0.36, 0.06, 0.36, 0, 0.53, 0, 'metal'),
    box(0.08, 0.06, 0.08, 0, 0.32, 0.15, 'metal'),
    cyl(0.04, 0.08, 0, 0.06, 0.13, 'white'),
    box(0.05, 0.05, 0.01, 0.1, 0.4, 0.18, 'accent'),
  ],
  plant: [
    cyl(0.22, 0.35, 0, 0.175, 0, 'pot'),
    blob(0.35, 0.45, 0.35, 0, 0.7, 0, 'plant'),
    blob(0.22, 0.3, 0.22, 0.15, 0.95, 0.05, 'plant'),
  ],
  whiteboard: [
    box(1.6, 1.0, 0.04, 0, 1.3, 0, 'white'),
    box(1.64, 0.04, 0.06, 0, 1.82, 0, 'metal'),
    ...[-1, 1].map((sx) => box(0.04, 1.8, 0.04, sx * 0.75, 0.9, 0, 'metal')),
    // Doodles: a blue line, a red line, a mint mark.
    box(0.5, 0.03, 0.01, -0.3, 1.5, 0.025, 'blue'),
    box(0.4, 0.03, 0.01, 0.3, 1.2, 0.025, 'accent'),
    box(0.03, 0.35, 0.01, 0.1, 1.35, 0.025, 'mint'),
  ],
  filingCabinet: [
    box(0.45, 1.3, 0.6, 0, 0.65, 0, 'metal'),
    ...[0.35, 0.7, 1.05].flatMap((y) => [box(0.4, 0.02, 0.01, 0, y, 0.305, 'dark'), box(0.12, 0.03, 0.03, 0, y + 0.12, 0.31, 'dark')]),
  ],
  reception: [
    box(2.4, 1.1, 0.7, 0, 0.55, 0, 'wood'),
    box(2.5, 0.06, 0.8, 0, 1.13, 0, 'white'),
    box(2.2, 0.6, 0.02, 0, 0.6, 0.36, 'accent'),
    box(0.5, 0.35, 0.04, 0.5, 1.35, -0.1, 'dark'),
  ],
} as const satisfies Record<string, readonly PropPrim[]>;
