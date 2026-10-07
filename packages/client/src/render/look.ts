// Visual-only constants: colors from docs/ART_STYLE.md and greybox proportions.
// Gameplay numbers never live here (they come from config/). These only change looks.

import type { BodyPreset } from '@escape/shared';
import type { SidePoint } from './sideProfile';

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

/** The Smart Oasis sandstorm (its fog distances come from the track file). */
/** Ghost of your best lap (P11.1): recording and how the see-through car looks. */
export const GHOST = {
  /** Stored path samples per second (resampled from the drawn frames). */
  hz: 20,
  /** Laps longer than this are not kept (s): stuck, AFK. */
  maxLapSeconds: 240,
  /** A gap between drawn frames longer than this (tab hidden, hitch) spoils the lap (ms). */
  maxGapMs: 500,
  /** Body color, glow and opacity of the ghost car. */
  color: 0xbfe9ff,
  glow: 0x3a6a8a,
  opacity: 0.4,
} as const;

/** Photo-finish replay (P11.2): when, what is kept, and how it is shown. */
export const PHOTO = {
  /** 1st and 2nd finishing at most this far apart (ms) is a photo finish. */
  gapMs: 500,
  /** Drawn car poses kept for a replay (s) and how often (per s). */
  bufferSeconds: 4,
  hz: 30,
  /** Wait after the runner-up's finish arrives before cutting the clip (ms): the drawn cars cross a bit later. */
  waitMs: 700,
  /** The replay runs from this long before the winner crosses to this long after the runner-up (s). */
  leadSeconds: 1.2,
  tailSeconds: 0.8,
  /** Replay speed (0.4 = slow motion). */
  rate: 0.4,
  /** Camera: beside the road at the line, this far out from the road edge and this high (m). */
  camSide: 9,
  camHeight: 5,
  /** It looks at the middle of the line this high (m). */
  lookHeight: 0.8,
} as const;

export const SANDSTORM = {
  /** Fog and sky color while it blows. */
  color: 0xd9a865,
  /** Seconds to blow in or die down. */
  fadeSeconds: 2.5,
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
  /** Dune jumps (ramp zones with `look: 'dune'`): sand color; the back slope is this share of the rise. */
  duneColor: 0xe0b46e,
  duneBackSlope: 0.3,
  /** Icy cold aisle (slick zones with `look: "ice"`). */
  iceColor: 0xb8e6ff,
  iceOpacity: 0.55,
  /** Fan push zones: chevrons every N samples, their length/spread/thickness and inset from the edge (m). */
  fanChevronEvery: 5,
  fanChevronLength: 1.6,
  fanChevronSpread: 1.1,
  fanChevronThick: 0.35,
  fanChevronInset: 1,
  fanChevronColor: 0x4cc9f0,
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
  /** Road color per track theme (anything else: asphalt): copper-gold traces on the motherboard. */
  roadByTheme: { motherboard: 0xb8862f } as Readonly<Record<string, number>>,
  /** Chip ramps (ramp zones with `look: 'chip'`). */
  chipRampColor: 0x1e2127,
  /** Ground color per track theme (anything else: sand). */
  groundByTheme: { office: PALETTE.carpet, serverRoom: 0x2b3140, oasis: 0xebcb94, motherboard: 0x1d5c3a } as Readonly<Record<string, number>>,
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
  /** The dark rim under the table: wider by, as tall as (× table height), and how much lower (m); round segments. */
  rimOut: 0.15,
  rimHeightShare: 0.8,
  rimDrop: 0.02,
  segments: 48,
} as const;

/** Main menu timings (ms): how long each fake loading message and each slideshow image stays. */
export const MENU = {
  messageMs: 2600,
  slideMs: 5000,
  /** The Join window refreshes its list of games this often (ms). */
  gamesPollMs: 2000,
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

/** A real-life car type for the car kit (ART_STYLE §4, P12.2). Side outlines are [z, y] points
 * in meters (z forward from the car's center, y up from the ground; see sideProfile.ts). */
export interface CarBodyLook {
  width: number;
  /** Bottom of the body above the ground. */
  ride: number;
  /** Wheel centers sit ± this far forward/back. */
  wheelBase: number;
  /** Body top line, front to back: nose, hood, shoulders, deck, tail (the kit adds the bottom). */
  outline: readonly SidePoint[];
  /** Cabin side (windshield base, roof front, roof back, rear window base), counter-clockwise. */
  cabin: readonly SidePoint[];
  /** Cabin width as a share of the body's (narrower = more shoulder). */
  cabinWidth: number;
  /** Side windows: [front z, back z] of each pane (the cabin's frame trims them). */
  windows: readonly (readonly [number, number])[];
  /** Where the two heads poke through the roof (z). */
  seatZ: number;
  /** A pickup's open bed: from/to z, floor height and side-rail height. */
  bed?: { front: number; back: number; floor: number; rail: number };
}

/** The car types (BODY_PRESETS): real-life proportions, original and unbranded. */
export const CAR_BODIES: Readonly<Record<BodyPreset, CarBodyLook>> = {
  hatchback: {
    width: 1.85, ride: 0.28, wheelBase: 1.25, cabinWidth: 0.82, seatZ: -0.3,
    outline: [[1.97, 0.62], [1.85, 0.8], [0.85, 0.93], [-1.75, 0.99], [-1.95, 0.9]],
    cabin: [[0.9, 0.86], [0.0, 1.4], [-1.45, 1.38], [-1.9, 0.86]],
    windows: [[0.8, -0.32], [-0.42, -1.45]],
  },
  sedan: {
    width: 1.85, ride: 0.26, wheelBase: 1.4, cabinWidth: 0.82, seatZ: -0.12,
    outline: [[2.22, 0.62], [2.08, 0.79], [0.98, 0.91], [-2.02, 0.97], [-2.2, 0.9]],
    cabin: [[1.02, 0.86], [0.15, 1.38], [-0.95, 1.38], [-1.6, 0.9]],
    windows: [[0.9, -0.2], [-0.3, -1.3]],
  },
  pickup: {
    width: 1.95, ride: 0.38, wheelBase: 1.55, cabinWidth: 0.86, seatZ: 0.12,
    outline: [[2.42, 0.95], [2.3, 1.12], [1.15, 1.2], [-0.8, 1.22], [-0.8, 0.98], [-2.42, 0.98]],
    cabin: [[1.18, 1.14], [0.6, 1.8], [-0.62, 1.8], [-0.72, 1.14]],
    windows: [[1.02, 0.02], [-0.08, -0.62]],
    bed: { front: -0.8, back: -2.42, floor: 0.98, rail: 1.22 },
  },
  muscle: {
    width: 1.95, ride: 0.24, wheelBase: 1.45, cabinWidth: 0.8, seatZ: -0.55,
    outline: [[2.37, 0.66], [2.25, 0.82], [0.45, 0.9], [-2.25, 0.93], [-2.37, 0.83]],
    cabin: [[0.5, 0.84], [-0.25, 1.25], [-0.95, 1.25], [-1.95, 0.87]],
    windows: [[0.35, -1.1]],
  },
  suv: {
    width: 1.95, ride: 0.38, wheelBase: 1.42, cabinWidth: 0.88, seatZ: 0.02,
    outline: [[2.27, 0.95], [2.15, 1.1], [1.2, 1.16], [-2.2, 1.2], [-2.27, 1.12]],
    cabin: [[1.24, 1.1], [0.48, 1.76], [-2.05, 1.76], [-2.22, 1.12]],
    windows: [[1.08, 0.15], [0.05, -1.0], [-1.1, -2.1]],
  },
  city: {
    width: 1.68, ride: 0.26, wheelBase: 1.1, cabinWidth: 0.86, seatZ: -0.1,
    outline: [[1.67, 0.68], [1.5, 0.88], [1.0, 0.98], [-1.57, 1.0], [-1.67, 0.94]],
    cabin: [[1.03, 0.93], [0.32, 1.55], [-1.42, 1.55], [-1.62, 0.95]],
    windows: [[0.9, -0.2], [-0.3, -1.45]],
  },
  sports: {
    width: 1.98, ride: 0.2, wheelBase: 1.35, cabinWidth: 0.78, seatZ: -0.42,
    outline: [[2.17, 0.5], [2.0, 0.64], [1.35, 0.86], [0.6, 0.8], [-1.35, 0.93], [-2.0, 0.92], [-2.17, 0.84]],
    cabin: [[0.65, 0.76], [-0.18, 1.14], [-0.72, 1.14], [-1.8, 0.88]],
    windows: [[0.5, -0.9]],
  },
  van: {
    width: 2.0, ride: 0.32, wheelBase: 1.6, cabinWidth: 0.94, seatZ: 0.5,
    outline: [[2.47, 0.98], [2.3, 1.16], [1.6, 1.24], [-2.42, 1.26], [-2.47, 1.2]],
    cabin: [[1.64, 1.18], [0.88, 2.15], [-2.42, 2.15], [-2.47, 1.18]],
    windows: [[1.48, 0.62]],
  },
};

/** Car kit look rules: shared sizes and the trim/part colors (team paint comes from the slot). */
export const CAR_KIT = {
  /** Wheels: a bit bigger than real (about 1.15×) so they read from the chase cam. */
  wheelRadius: 0.36,
  wheelWidth: 0.3,
  wheelSegments: 14,
  /** Rims: share of the tire radius, low-poly. */
  rimShare: 0.6,
  rimSegments: 8,
  /** Low-poly round shapes (dish, speaker cones, spare wheel). */
  roundSegments: 8,
  /** Wheel arches: gap around the tire, the least body left above an arch, segments. */
  archGap: 0.05,
  archSkin: 0.04,
  archSegments: 6,
  /** Heads poke this share of their radius above the roof. */
  headAboveRoof: 0.85,
  trim: 0x1e2230,
  /** Tinted window glass. */
  glass: 0x3d5468,
  metal: 0xd9dde3,
  rim: 0xc9ced6,
  light: 0xfff6d6,
  tail: 0xe63946,
  plate: 0xf4f1e8,
  stripe: 0xf7f7f2,
  signYellow: 0xffb703,
  /** Roof number decal: size (m), lift off the surface, and the atlas (8 numbers in a row, px each). */
  numberSize: 0.6,
  numberLift: 0.012,
  numberPx: 64,
  /** Blob shadow radius as a share of the car's length (or width, if wider). */
  shadowShare: 0.45,
} as const;

/** Car kit trim and part dimensions (m; shares are of the car's or cabin's width). */
export const CAR_PARTS_LOOK = {
  /** Window frame (pillar) width and glass pane thickness. */
  pillar: 0.07,
  glassThick: 0.03,
  bumper: { height: 0.18, depth: 0.14, out: 0.05 },
  headlight: { width: 0.4, height: 0.13, sideShare: 0.68, below: 0.04 },
  taillight: { width: 0.36, height: 0.14, sideShare: 0.72, below: 0.05 },
  grille: { widthShare: 0.34, height: 0.16, heightShare: 0.6 },
  plate: { width: 0.46, height: 0.12, depth: 0.02 },
  lightDepth: 0.06,
  /** Dark sills along the bottom of the doors. */
  sill: { height: 0.1, thick: 0.05 },
  mirror: { width: 0.18, height: 0.12, depth: 0.1, back: 0.18, lift: 0.16 },
  /** The open sunroof the heads poke through. */
  sunroof: { widthShare: 0.72, length: 0.9 },
  /** Roof parts keep this gap from the roof's back edge and from the heads. */
  roofMargin: 0.08,
  /** On the hood, the number sits this share of the way from the nose to the windshield. */
  numberHoodAt: 0.35,
  spoiler: { back: 0.35, lift: 0.2, post: 0.07, postSideShare: 0.32, widthShare: 1.12, thick: 0.06, depth: 0.42, plate: 0.22 },
  roofSign: { widthShare: 0.6, height: 0.36, depth: 0.4, stripe: 0.08 },
  roofBox: { widthShare: 0.72, height: 0.36, length: 1.3, rail: 0.05, railSideShare: 0.42 },
  dish: { post: 0.05, postHeight: 0.4, radius: 0.55, rim: 0.15, thick: 0.12, tilt: -0.6, sideShare: 0.35 },
  ladder: { rail: 0.06, gap: 0.18, rungWidth: 0.42, rungs: 6, sideShare: -0.4, lengthShare: 0.8 },
  speakers: { width: 0.62, height: 0.85, depth: 0.55, cone: 0.2, sideShare: 0.45, behindCabin: 0.5 },
  hoodScoop: { widthShare: 0.34, height: 0.16, length: 0.7, at: 0.7 },
  spareWheel: { share: 0.92, thick: 0.26 },
  /** Racing stripes over hood, roof and deck: width, gap between the two, thickness. */
  stripes: { width: 0.16, gap: 0.14, thick: 0.015 },
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
  rack: 0x2a2f3d, led: 0x3dff9a, amber: 0xffb703,
  trunk: 0x9c6b3c, palm: 0x3a9d4f, coconut: 0x6b4423, dune: 0xe0b46e, rock: 0xa58f78,
  cloth: 0xe63946, water: 0x3fa7d6,
  chip: 0x1e2127, pin: 0xc9ced6, copper: 0xd09a45, capBlue: 0x2f4fa8, ceramic: 0xd8c08f,
  bandRed: 0xd62828, bandViolet: 0x7b2cbf, fin: 0x9aa3ad,
  // Seasonal decorations (P11.3).
  snow: 0xf7fbff, carrot: 0xf28c28, pine: 0x2e7d4f, gold: 0xf2c14e, pumpkin: 0xf08a24, stem: 0x5a7d2a,
  flame: 0xffd23f, wax: 0xf6efe0, sheet: 0xf2f2f7, brass: 0xc8963e, glassRed: 0xd8343f, glassGreen: 0x2ea86b,
  balloonPink: 0xff6fae,
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
  // Server room set (P10.1). A rack of servers, its front (+Z) full of status LEDs.
  serverRack: [
    box(0.6, 2.0, 1.0, 0, 1.0, 0, 'rack'),
    ...[0.35, 0.65, 0.95, 1.25, 1.55, 1.85].flatMap((y, i) => [
      box(0.5, 0.18, 0.02, 0, y, 0.505, 'dark'),
      box(0.04, 0.04, 0.02, -0.18, y, 0.52, i % 3 === 2 ? 'amber' : 'led'),
      box(0.04, 0.04, 0.02, -0.1, y, 0.52, i % 2 === 0 ? 'led' : 'blue'),
    ]),
  ],
  // A floor cable tray with a tangle of colored cables.
  cableTray: [
    box(2.0, 0.08, 0.45, 0, 0.04, 0, 'metal'),
    ...[-1, 1].map((sz) => box(2.0, 0.14, 0.03, 0, 0.07, sz * 0.21, 'metal')),
    blob(0.95, 0.06, 0.06, -0.02, 0.12, -0.12, 'blue'),
    blob(0.95, 0.06, 0.06, 0.03, 0.12, 0, 'accent'),
    blob(0.95, 0.06, 0.06, 0, 0.12, 0.12, 'amber'),
  ],
  // A giant cooling fan facing +Z: housing, grille, blades in a cross, stand.
  coolingFan: [
    box(1.6, 1.6, 0.3, 0, 1.2, 0, 'white'),
    box(1.3, 1.3, 0.02, 0, 1.2, 0.16, 'dark'),
    blob(0.55, 0.12, 0.04, 0, 1.2, 0.19, 'metal'),
    blob(0.12, 0.55, 0.04, 0, 1.2, 0.19, 'metal'),
    cyl(0.1, 0.05, 0, 1.2, 0.2, 'blue'),
    box(0.25, 0.4, 0.5, 0, 0.2, 0, 'rack'),
  ],
  // A big air conditioner: vents, a blue display.
  acUnit: [
    box(1.0, 1.8, 0.6, 0, 0.9, 0, 'white'),
    ...[1.2, 1.35, 1.5, 1.65].map((y) => box(0.8, 0.04, 0.02, 0, y, 0.31, 'dark')),
    box(0.3, 0.12, 0.02, 0, 0.9, 0.31, 'blue'),
  ],
  // A palm tree: a leaning, stacked trunk, four floppy fronds and coconuts.
  palm: [
    ...[0, 1, 2, 3].map((i) => cyl(0.22 - i * 0.02, 1.2, i * 0.15, 0.6 + i * 1.15, 0, 'trunk')),
    ...[-1, 1].flatMap((k) => [blob(1.8, 0.14, 0.45, 0.6 + k * 1.5, 4.7, 0, 'palm'), blob(0.45, 0.14, 1.8, 0.6, 4.7, k * 1.5, 'palm')]),
    blob(0.3, 0.3, 0.3, 0.6, 4.45, 0.15, 'coconut'),
  ],
  // A low sand dune (decoration; the jumps are ramp zones that look like dunes).
  dune: [
    blob(4.5, 1.2, 2.5, 0, 0, 0, 'dune'),
    blob(2.2, 1.0, 1.6, 1.8, 0, 0.6, 'dune'),
  ],
  // A pile of desert rocks.
  rock: [
    blob(1.0, 0.7, 0.85, 0, 0.35, 0, 'rock'),
    blob(0.6, 0.45, 0.55, 0.9, 0.2, 0.3, 'rock'),
    blob(0.4, 0.3, 0.4, -0.7, 0.15, 0.5, 'rock'),
  ],
  // A striped desert tent: a cloth roof on four poles, an open front (+Z).
  tent: [
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cyl(0.06, 2.0, sx * 1.4, 1.0, sz * 1.1, 'wood'))),
    box(3.1, 0.12, 2.5, 0, 2.05, 0, 'cloth'),
    box(3.1, 0.13, 0.5, 0, 2.06, 0, 'white'),
    box(3.1, 1.6, 0.06, 0, 1.2, -1.15, 'cloth'),
    box(1.2, 0.3, 0.8, 0, 0.15, 0, 'accent'),
  ],
  // The oasis pond: water with a rim of sand and rocks.
  pond: [
    blob(5.4, 0.12, 3.9, 0, 0, 0, 'dune'),
    blob(5.0, 0.12, 3.5, 0, 0.04, 0, 'water'),
    ...[[-4.6, 1.4], [3.9, -2.3], [1.2, 3.4]].map(([x, z]) => blob(0.6, 0.4, 0.5, x!, 0.15, z!, 'rock')),
  ],
  // Motherboard parts, giant next to the tiny cars. A chip: a black block with silver legs.
  chip: [
    box(8, 0.9, 8, 0, 0.45, 0, 'chip'),
    ...[-1, 1].flatMap((side) => [-3, -1.8, -0.6, 0.6, 1.8, 3].map((x) => box(0.5, 0.5, 0.8, x, 0.25, side * 4.3, 'pin'))),
    cyl(0.4, 0.05, -2.8, 0.92, -2.8, 'fin'),
  ],
  // An electrolytic capacitor: a tall blue can with a silver top and a pale stripe.
  capacitor: [
    cyl(1.6, 4.2, 0, 2.1, 0, 'capBlue'),
    cyl(1.62, 0.1, 0, 4.2, 0, 'pin'),
    box(0.5, 4.0, 0.1, 0, 2.1, 1.58, 'ceramic'),
  ],
  // A resistor lying on the board: a tan body with color bands and wire legs.
  resistor: [
    blob(2.4, 0.8, 0.8, 0, 0.9, 0, 'ceramic'),
    ...[[-1.2, 'bandRed'], [-0.5, 'bandViolet'], [0.2, 'dark'], [1.3, 'amber']].map(([x, c]) => blob(0.18, 0.84, 0.84, x as number, 0.9, 0, c as keyof typeof PROP_COLORS)),
    ...[-1, 1].map((k) => box(1.6, 0.12, 0.12, k * 3.1, 0.9, 0, 'pin')),
  ],
  // The CPU cooler at the middle of the board: heatsink fins under a giant fan.
  cpuFan: [
    box(22, 1.0, 22, 0, 0.5, 0, 'fin'),
    ...[-8, -4, 0, 4, 8].map((x) => box(1.0, 3.0, 22, x, 2.5, 0, 'fin')),
    box(20, 1.2, 20, 0, 4.6, 0, 'chip'),
    blob(8.5, 0.35, 1.8, 0, 5.4, 0, 'dark'),
    blob(1.8, 0.35, 8.5, 0, 5.4, 0, 'dark'),
    cyl(2.2, 0.6, 0, 5.5, 0, 'pin'),
  ],
  // A copper trace on the board with a round pad at its end.
  trace: [
    box(10, 0.04, 0.5, 0, 0.02, 0, 'copper'),
    cyl(0.6, 0.05, 5, 0.025, 0, 'copper'),
  ],
} as const satisfies Record<string, readonly PropPrim[]>;

/**
 * Seasonal decorations (P11.3) at real size (m; +Z = its front, toward the road). Built and
 * scaled like the office props. Original shapes from boxes, cylinders and blobs.
 */
export const DECOR_SHAPES = {
  // Three snowballs, coal eyes, a carrot nose, a red scarf and a top hat.
  snowman: [
    blob(0.45, 0.4, 0.45, 0, 0.4, 0, 'snow'),
    blob(0.33, 0.3, 0.33, 0, 1.0, 0, 'snow'),
    blob(0.24, 0.22, 0.24, 0, 1.45, 0, 'snow'),
    cyl(0.27, 0.08, 0, 1.24, 0, 'accent'),
    box(0.06, 0.06, 0.24, 0, 1.45, 0.3, 'carrot'),
    ...[-1, 1].map((k) => box(0.05, 0.05, 0.04, k * 0.09, 1.53, 0.21, 'dark')),
    ...[1.0, 0.82].map((y) => box(0.06, 0.06, 0.04, 0, y, 0.32, 'dark')),
    cyl(0.2, 0.04, 0, 1.64, 0, 'dark'),
    cyl(0.13, 0.26, 0, 1.79, 0, 'dark'),
  ],
  // A present: red paper, gold ribbon both ways and a bow on top.
  giftBox: [
    box(0.7, 0.55, 0.7, 0, 0.275, 0, 'accent'),
    box(0.72, 0.56, 0.12, 0, 0.28, 0, 'gold'),
    box(0.12, 0.56, 0.72, 0, 0.28, 0, 'gold'),
    ...[-1, 1].map((k) => blob(0.12, 0.08, 0.06, k * 0.1, 0.6, 0, 'gold')),
  ],
  // A stacked pine tree with ornaments and a star.
  pineTree: [
    cyl(0.12, 0.4, 0, 0.2, 0, 'trunk'),
    cyl(0.8, 0.5, 0, 0.6, 0, 'pine'),
    cyl(0.6, 0.5, 0, 1.05, 0, 'pine'),
    cyl(0.4, 0.5, 0, 1.5, 0, 'pine'),
    cyl(0.2, 0.4, 0, 1.9, 0, 'pine'),
    box(0.18, 0.18, 0.06, 0, 2.2, 0, 'flame'),
    ...([[0.7, 0.62, 'accent'], [-0.5, 1.05, 'gold'], [0.35, 1.5, 'blue'], [-0.2, 1.92, 'accent']] as const).map(([x, y, c]) => blob(0.07, 0.07, 0.07, x, y, 0.3, c)),
  ],
  // A jack-o'-lantern: glowing eyes and grin, a green stem.
  pumpkin: [
    blob(0.45, 0.32, 0.42, 0, 0.32, 0, 'pumpkin'),
    blob(0.32, 0.34, 0.44, 0, 0.33, 0, 'pumpkin'),
    cyl(0.05, 0.16, 0, 0.7, 0, 'stem'),
    ...[-1, 1].map((k) => box(0.1, 0.09, 0.08, k * 0.14, 0.42, 0.38, 'flame')),
    box(0.3, 0.06, 0.08, 0, 0.24, 0.39, 'flame'),
  ],
  // A bedsheet ghost floating a little above the ground.
  sheetGhost: [
    blob(0.38, 0.62, 0.38, 0, 0.9, 0, 'sheet'),
    blob(0.28, 0.28, 0.28, 0, 1.5, 0, 'sheet'),
    ...[-1, 1].map((k) => box(0.08, 0.12, 0.04, k * 0.1, 1.55, 0.25, 'dark')),
    box(0.1, 0.1, 0.04, 0, 1.38, 0.26, 'dark'),
  ],
  // A big candle on a dish.
  candle: [
    cyl(0.28, 0.05, 0, 0.025, 0, 'dark'),
    cyl(0.15, 0.8, 0, 0.45, 0, 'wax'),
    blob(0.06, 0.13, 0.06, 0, 0.98, 0, 'flame'),
  ],
  // A Ramadan lantern (fanous) hanging from a little post: brass caps, red glass.
  lantern: [
    cyl(0.05, 1.8, 0, 0.9, 0, 'dark'),
    box(0.6, 0.05, 0.05, 0.3, 1.78, 0, 'dark'),
    box(0.02, 0.12, 0.02, 0.55, 1.7, 0, 'brass'),
    cyl(0.18, 0.06, 0.55, 1.6, 0, 'brass'),
    blob(0.1, 0.1, 0.1, 0.55, 1.66, 0, 'brass'),
    box(0.26, 0.36, 0.26, 0.55, 1.39, 0, 'glassRed'),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.03, 0.38, 0.03, 0.55 + sx * 0.13, 1.39, sz * 0.13, 'brass'))),
    cyl(0.18, 0.06, 0.55, 1.18, 0, 'brass'),
    blob(0.05, 0.08, 0.05, 0.55, 1.1, 0, 'brass'),
  ],
  // A crescent moon and a star on a tall brass pole.
  crescent: [
    cyl(0.05, 2.0, 0, 1.0, 0, 'brass'),
    ...[50, 80, 110, 140, 170, 200, 230, 260, 290, 310].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return box(0.13, 0.13, 0.08, Math.cos(a) * 0.36, 2.35 + Math.sin(a) * 0.36, 0, 'gold');
    }),
    box(0.12, 0.12, 0.08, 0.12, 2.38, 0, 'gold'),
  ],
  // A bunch of balloons tied to a little weight.
  balloons: [
    box(0.16, 0.12, 0.16, 0, 0.06, 0, 'dark'),
    ...([[-0.2, 1.7, 'accent'], [0.18, 1.9, 'blue'], [0, 2.15, 'gold'], [0.3, 1.55, 'balloonPink']] as const).flatMap(([x, y, c]) => [
      box(0.015, y - 0.25, 0.015, x / 2, (y - 0.25) / 2 + 0.1, 0, 'white'),
      blob(0.2, 0.25, 0.2, x, y, 0, c),
    ]),
  ],
} as const satisfies Record<string, readonly PropPrim[]>;

/** Seasonal decorations are drawn this much bigger again than the office props (goofy giants). */
export const DECOR_LOOK = { scale: 1.5 } as const;

/** Falling snow (winter seasons): flakes in a box around the camera. */
export const SNOW = {
  count: 900,
  /** Box around the camera the flakes live in (m): half width, height. */
  halfSize: 40,
  height: 30,
  /** Fall speed (m/s) and sideways drift. */
  fall: 2.2,
  drift: 0.6,
  /** Flake size (world units) and color. */
  size: 0.22,
  color: 0xffffff,
} as const;
