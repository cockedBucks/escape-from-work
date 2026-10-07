import { z } from 'zod';
import { AWARD_STATS } from '../league/awards';
import { parseConfig } from './parse';

// Strict objects: an unknown key (usually a typo) is an error, not silently ignored.

const pos = () => z.number().positive();
const nonNeg = () => z.number().nonnegative();
const fraction = () => z.number().min(0).max(1);

/** Base car handling. Per-car `stats` in cars.json multiply some of these (around 1.0). */
const CarSchema = z.strictObject({
  /** Collision circle radius (m). */
  radius: pos(),
  /** Forward top speed on gas (m/s). Scaled by car `stats.speed`. Capped so cars cannot tunnel through walls. */
  topSpeed: pos().max(100),
  /** Engine acceleration from standstill (m/s²). Scaled by car `stats.speed`. */
  accel: pos(),
  /** Shape of the engine pull: 1 = fades evenly toward top speed, 2+ = stays strong until near the top. */
  accelCurve: z.number().min(0.5).max(6),
  /** Braking deceleration while moving forward (m/s²). */
  brake: pos(),
  /** Top speed in reverse (m/s). */
  reverseTopSpeed: pos(),
  /** Acceleration in reverse (m/s²). */
  reverseAccel: pos(),
  /** Coasting slowdown: fraction of speed lost per second with no gas or brake (1/s). */
  drag: nonNeg(),
  /** Coasting slowdown that does not depend on speed, so a rolling car comes to a stop (m/s²). */
  rollingResistance: nonNeg(),
  /** How fast sideways sliding is removed (1/s). Higher = stickier. Scaled by `stats.grip`. */
  grip: pos(),
  /** Grip multiplier on slick zones (0–1). */
  slickGrip: fraction(),
  /** Grip multiplier while drifting (0–1): lower = wider slides. */
  driftGrip: fraction(),
  /** How fast steering moves toward the pressed direction (full lock per second). */
  steerRiseRate: pos(),
  /** How fast steering returns to center when released (full lock per second). */
  steerFallRate: pos(),
  /** Turn rate at full lock (rad/s). */
  maxYawRate: pos(),
  /** How much of each turn the car's movement follows at once (0 = spins, grip catches up; 1 = on rails). */
  carve: fraction(),
  /** Turn-rate multiplier at top speed (0–1): lower = calmer steering when fast. */
  steerAtTopSpeed: fraction(),
  /** Below this speed the car turns less, down to nothing when stopped (m/s). */
  steerFullSpeed: pos(),
  /** How much speed into a wall bounces back out (0 = stick, 1 = perfect bounce). */
  wallBounce: fraction(),
  /** Fraction of along-wall speed lost on a wall hit (0–1). */
  wallSpeedLoss: fraction(),
  /** Smallest speed into a wall that counts as a hit event (m/s). */
  wallHitMinSpeed: nonNeg(),
  /** How bouncy car-vs-car bumps are (0 = cars stick, 1 = perfect bounce). */
  carBounce: fraction(),
  /** Smallest closing speed between two cars that counts as a bump event (m/s). */
  carHitMinSpeed: nonNeg(),
  /** Downward pull while airborne (m/s²). Arcade: higher than real gravity. */
  gravity: pos(),
  /** Upward launch speed from a ramp at top speed, times the zone's `launch` (m/s). */
  rampLaunch: pos(),
  /** Smallest falling speed that counts as a landing event (m/s). */
  landingMinSpeed: nonNeg(),
  /** Top-speed multiplier inside a swap lane (< 1: the lane costs a little time). */
  swapLaneSpeed: z.number().min(0.1).max(1),
});

/** Solo players (GAME_DESIGN §3): an optional handicap for a car with one player. */
const SoloSchema = z.strictObject({
  /** Top-speed and engine multiplier for solo cars (1 = no handicap). */
  speedMultiplier: z.number().min(0.5).max(1.5),
});

const SimSchema = z.strictObject({
  /** Fixed sim timestep in seconds (1/60). */
  dt: z.number().positive().max(0.1),
});

/** How track files are turned into geometry, and the limits `track:check` enforces. */
const TrackBuildSchema = z.strictObject({
  /** Distance between centerline samples (m). Smaller = smoother walls, more segments. */
  sampleSpacing: z.number().min(0.25).max(10),
  /** Spatial grid cell size for track and wall lookups (m). */
  gridCellSize: pos(),
  /** Narrowest road `track:check` accepts (m). */
  minWidth: pos(),
  /** Narrowest shortcut (branch) `track:check` accepts (m): shortcuts are meant to be tight. */
  branchMinWidth: pos(),
  /** Median bot lap time window for real (non-dev) tracks (s), GAME_DESIGN §9. */
  lapTargetMin: pos(),
  lapTargetMax: pos(),
});

/** Bot driver (also used by golden tests, so changing it moves the golden lap window). */
const BotSchema = z.strictObject({
  /** Pilot: look this far ahead along the centerline at standstill (m). */
  lookAheadBase: pos(),
  /** Pilot: plus this many seconds of travel at the current speed (s). */
  lookAheadTime: nonNeg(),
  /** Pilot: steer amount per radian of angle to the look-ahead point. */
  steerGain: pos(),
  /** Engineer: sideways acceleration the bot trusts in corners (m/s²). Higher = braver. */
  cornerAccel: pos(),
  /** Engineer: braking the bot plans with (m/s²), kept below `car.brake` for safety. */
  brakePlanDecel: pos(),
  /** Engineer: how far ahead to plan corner speeds (m). */
  planDistance: pos(),
  /** Engineer: brake only when this much faster than the planned speed (m/s). */
  speedMargin: nonNeg(),
  /** Below this speed (m/s) for `stuckSeconds`, the bot presses respawn. */
  stuckSpeed: nonNeg(),
  stuckSeconds: pos(),
  /** Stuck this long (s): first back up (reverse) for `backUpSeconds`, up to `maxBackUps` times. */
  backUpAfter: pos(),
  backUpSeconds: pos(),
  maxBackUps: z.number().int().min(0),
  /** Making this much progress along the track (m) counts as unstuck again (back-ups allowed again). */
  backUpResetDistance: pos(),
  /** Slower than `turnAroundSpeed` (m/s) with the road ahead more than `turnAroundAngle` (rad) off
   * the nose: reverse with the wheel turned (three-point turn) for up to `turnAroundSeconds`,
   * until it is within `turnAroundDone` (rad). */
  turnAroundAngle: z.number().positive().max(Math.PI),
  turnAroundDone: z.number().positive().max(Math.PI),
  turnAroundSpeed: pos(),
  turnAroundSeconds: pos(),
  /** Engineer: lets go of the gas at this engine heat (0–1) so the engine never stalls. */
  heatLiftAt: z.number().min(0).max(1),
  /** Skill 1+: while drifting it stays on the gas up to this heat, so letting go still boosts. */
  driftHeatLiftAt: z.number().min(0).max(1),
  /** Skill of server and network bots: 0 = plain driving, 1 = also drifts, 2 = drifts + nitro. */
  skill: z.number().int().min(0).max(2),
  /** Bots with at least this skill take shortcuts (track branches). */
  shortcutSkill: z.number().int().min(0).max(3),
  /** Look-ahead distance multiplier while aiming into a shortcut (narrow: aim closer). */
  shortcutLookAhead: z.number().min(0.1).max(1),
  /** Skill 1+: tap for a drift when a corner this tight (1/m) is within `driftLookAhead` m... */
  driftMinCurvature: pos(),
  driftLookAhead: pos(),
  /** ...and hold it only while the road within `driftHoldAhead` m still turns that way that tightly. */
  driftHoldAhead: pos(),
  /** No drift start when a tight corner the other way comes within this many meters (S-bends). */
  driftClearAhead: pos(),
  /** Skill 1+: steer this much past the drift entry / release thresholds (0–1), to be sure. */
  driftSteerMargin: fraction(),
  /** Skill 2: burn nitro on a clear straight while the engine is below this heat (0–1). */
  nitroMaxHeat: z.number().min(0).max(1),
  /** Items (skill 1+): Reply-All fires at a car within `itemAimCone` rad and `itemAimRange` m;
   * Coffee Spill drops when a car is within `itemDropRange` m behind. */
  itemAimCone: pos(),
  itemAimRange: pos(),
  itemDropRange: pos(),
  /** Coffee Spill: a car counts as "behind" within this angle (rad) of straight back. */
  itemDropCone: pos(),
  /** Balance test: a skill-2 bot must be this much faster than a plain one (share of race time, min–max). */
  balanceGain: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
});

/** Three increasing values, one per drift level (blue, orange, pink). */
const perLevel = () => z.tuple([nonNeg(), nonNeg(), nonNeg()]);

/** Tandem drift (GAME_DESIGN §5): Engineer taps brake while the Pilot steers hard. */
const DriftSchema = z.strictObject({
  /** Entry: steering at least this hard (0–1)... */
  minSteer: fraction(),
  /** ...above this share of the car's top speed... */
  minSpeedRatio: fraction(),
  /** ...and a brake press. Held longer than this (ms), it is braking: the drift ends. */
  brakeTapMaxMs: z.number().int().positive(),
  /** The drift ends with no reward below this share of top speed. */
  exitSpeedRatio: fraction(),
  /** Steering under this (0–1) for `releaseMs` releases the drift: boost if on the gas then. */
  releaseSteer: fraction(),
  releaseMs: z.number().int().nonnegative(),
  /** Turn while drifting = base + range × steer into the drift (−1..1): steer out to go wide. */
  steerBase: fraction(),
  steerRange: fraction(),
  /** Turn-rate multiplier while drifting (> 1 = tighter). */
  turnRate: pos(),
  /** Multiplier on `car.carve` while drifting (lower = the nose points further in). */
  carve: fraction(),
  /** Seconds of drifting to reach level 1, 2, 3. */
  levelSeconds: perLevel().refine(([a, b, c]) => a < b && b < c, 'drift levels must take longer and longer'),
  /** Boost on release, per level: duration (s)... */
  boostSeconds: perLevel(),
  /** ...push (m/s²) up to `boostTopSpeed` × top speed... */
  boostAccel: pos(),
  boostTopSpeed: z.number().min(1).max(3),
  /** ...and nitro meter gained (0–1 of a full meter). */
  nitroPerLevel: perLevel(),
});

/** Engine heat (GAME_DESIGN §5): the Engineer's main decision. Heat is 0–1 (1 = stall). */
const HeatSchema = z.strictObject({
  /** Heat rises only at full gas above this share of the car's top speed (0–1). */
  hotSpeedFraction: z.number().min(0).max(1),
  /** Heat gained per second at full gas and speed (0.25 = +25%/s). */
  risePerSec: nonNeg(),
  /** Heat lost per second off the gas or braking... */
  coolPerSec: nonNeg(),
  /** ...and while driving on the gas with nothing heating the engine. */
  coolOnGasPerSec: nonNeg(),
  /** At full heat the engine stalls (no gas) for this long (s)... */
  stallSeconds: nonNeg(),
  /** ...then restarts at this heat (0–1). */
  restartHeat: z.number().min(0).max(1),
  /** Extra heat per second while burning nitro (on top of `risePerSec`). */
  nitroRisePerSec: nonNeg(),
});

/** Nitro (GAME_DESIGN §5): the Engineer burns the meter that drifts fill. */
const NitroSchema = z.strictObject({
  /** Meter used per second of burning (0.4 = a full meter lasts 2.5 s). */
  burnPerSec: pos(),
  /** Push (m/s²) up to `topSpeed` × the car's top speed. */
  accel: pos(),
  topSpeed: z.number().min(1).max(3),
});

/** Race rules. A stub for now; P3 adds countdown, finish and results. */
const RaceSchema = z.strictObject({
  /** Shortest time between two honks of the same car (s). */
  honkCooldownSeconds: nonNeg(),
  /** Fade-out time before a respawned car reappears (s). */
  respawnFadeSeconds: nonNeg(),
  /** Time a respawned car is ghosted: no collisions with other cars (s). */
  respawnGhostSeconds: nonNeg(),
  /** A grounded car this far outside the road edge (m) respawns by itself. */
  offTrackRespawnDistance: pos(),
  /** Starting grid: distance between rows of two cars, and first row behind the line (m). */
  gridRowSpacing: pos(),
  /** Starting grid: each car's sideways offset from the centerline (m, capped at half the road). */
  gridLateral: nonNeg(),
  /** "3… 2… 1… CLOCK OUT!" length (s); cars wait on the grid meanwhile. */
  countdownSeconds: pos(),
  /** Laps for a new lobby, and the range the host may pick from. */
  defaultLaps: z.number().int().min(1),
  minLaps: z.number().int().min(1),
  maxLaps: z.number().int().min(1),
  /** Safety limit: a race that runs this long (s) ends, and everyone not finished is DNF. */
  maxRaceSeconds: pos(),
  /** After the winner finishes, the others have this long to cross the line (s), then DNF. */
  finishWindowSeconds: pos(),
  /** Driving against the track faster than this (m/s)… */
  wrongWayMinSpeed: nonNeg(),
  /** …for this long (s) shows the wrong-way warning. */
  wrongWaySeconds: pos(),
  /** With bots on, bots fill empty cars until there are this many cars. */
  botFillCars: z.number().int().min(0).max(8),
  /** People who may watch on top of the 2 × maxCars seats. */
  maxSpectators: z.number().int().nonnegative(),
  /** Car slots in the lobby (2 players each, so players = 2 × maxCars). Team colors cover 8. */
  maxCars: z.number().int().min(1).max(8),
});

/** Battle mode (P11.6, GAME_DESIGN §13): lives instead of laps, last car standing wins. */
const BattleSchema = z.strictObject({
  /** Lives per car; an item hit that a Firewall does not block takes one. */
  lives: z.number().int().min(1).max(9),
  /** After losing a life a car cannot lose another for this long (s). */
  hitGraceSeconds: nonNeg(),
  /** The battle ends after this long (s): most lives left wins. */
  timeLimitSeconds: pos(),
});

/** Chase camera feel (client only, but tuned live like everything else). */
const CameraSchema = z.strictObject({
  /** Vertical field of view (degrees). */
  fov: z.number().min(30).max(110),
  /** Distance behind the car (m). */
  chaseDistance: pos(),
  /** Height above the car (m). */
  chaseHeight: pos(),
  /** The camera looks at a point this far ahead of the car (m)… */
  lookAhead: nonNeg(),
  /** …and this high above the ground (m). */
  lookHeight: nonNeg(),
  /** How quickly the camera catches up with the car (1/s). Higher = stiffer, lower = floatier. */
  followRate: pos(),
  /** Chase cam widens its view with speed (sense of speed): up to `speedFov` extra degrees at top
   * speed, starting from `speedFovFrom` × top speed. Nitro/boost speed widens it a bit more. */
  speedFov: nonNeg(),
  speedFovFrom: fraction(),
  /** Cockpit cam: field of view (degrees). */
  cockpitFov: z.number().min(30).max(120),
  /** Mouse look: radians of head turn per pixel of mouse movement. */
  mouseSensitivity: pos(),
  /** How far the head may turn left/right and up/down (rad). */
  headYawLimit: z.number().min(0).max(Math.PI),
  headPitchLimit: z.number().min(0).max(Math.PI / 2),
  /** With the mouse free, how fast the head turns back to straight ahead (1/s). */
  headRecenterRate: pos(),
  /** Head bob: how much a bump moves the head (m per m/s of impact), and how stiff the spring is (1/s). */
  headBob: nonNeg(),
  headBobStiffness: pos(),
});

const QualityPresetSchema = z.strictObject({
  /** Highest devicePixelRatio the renderer uses. */
  pixelRatioCap: z.number().min(0.5).max(3),
  /** "blob" = cheap fake shadows under cars, "map" = one real shadow map. */
  shadows: z.enum(['blob', 'map']),
  /** Shadow map size in pixels, used when `shadows` is "map". */
  shadowMapSize: z.number().int().min(256).max(4096),
  /** Rear-view mirror: off, every 2nd frame, or every frame. */
  mirror: z.enum(['off', 'half', 'full']),
  particles: z.enum(['reduced', 'normal']),
  /** Performance budget checked by /shots: draw calls in view. */
  maxDrawCalls: z.number().int().positive(),
  /** Performance budget checked by /shots: triangles in view. */
  maxTriangles: z.number().int().positive(),
});

const QualitySchema = z.strictObject({
  /** Preset used when the player has not picked one. */
  default: z.enum(['low', 'medium', 'high']),
  presets: z.strictObject({
    low: QualityPresetSchema,
    medium: QualityPresetSchema,
    high: QualityPresetSchema,
  }),
  /** Per-car model budget (all presets). */
  carMaxTriangles: z.number().int().positive(),
  /** Per prop (instanced, so this is per copy drawn). */
  propMaxTriangles: z.number().int().positive(),
  carMaxDrawCalls: z.number().int().positive(),
});

const NetSchema = z.strictObject({
  /** Port for the page and the multiplayer server. */
  port: z.number().int().min(1).max(65535),
  /** How often the server sends state patches to clients. */
  patchRateMs: z.number().int().positive(),
  /** How far in the past clients render other cars at least, so they can interpolate between patches. */
  interpDelayMs: z.number().int().nonnegative(),
  /** The most the delay may grow to on a jittery network (P13.1, adaptive buffer). */
  interpDelayMaxMs: z.number().int().nonnegative(),
  /** Extra ms on top of one patch interval + the 95th-percentile lateness. */
  interpMarginMs: nonNeg(),
  /** Snapshots the lateness is measured over (about 30 per second). */
  interpWindow: z.number().int().min(10).max(600),
  /** How fast the delay may grow / shrink (ms per second): the drawn cars run a bit slower / faster meanwhile. */
  interpGrowPerSec: pos(),
  interpShrinkPerSec: pos(),
  /** When the newest snapshot is late, keep moving other cars along their last motion for at most this long (ms). */
  extrapolateMaxMs: nonNeg(),
  /** How long a dropped player's seat is held for them. */
  reconnectSeconds: z.number().positive(),
  /** Input messages a client may send per second on average; extra ones are dropped. */
  inputRatePerSec: z.number().positive(),
  /** Short bursts above the average rate that are still allowed (messages). */
  inputBurst: z.number().int().min(1),
  /** Head-angle messages a client may send per second (cockpit look), and the burst. */
  headRatePerSec: z.number().positive(),
  headBurst: z.number().int().min(1),
  /** Clients send head angles at most this often (ms), and only when they changed. */
  headSendMs: z.number().int().min(10),
  /** Lobby messages (name, seat) a client may send per second on average, and the burst. */
  lobbyRatePerSec: z.number().positive(),
  lobbyBurst: z.number().int().min(1),
  /** Client prediction of your own car: how far ahead it may run the physics (ms). 0 = off. */
  predictMaxMs: nonNeg(),
  /** How fast a disagreement between prediction and the server fades out (1/s). */
  predictCorrectionRate: pos(),
  /** Clients resend their held controls this often (ms), so a lost message never leaves a key stuck. */
  inputResendMs: z.number().int().min(50),
  /** Games players may host at the same time on one server (P12.1), on top of the always-open one. */
  maxGames: z.number().int().min(1).max(32),
});

/** Days of the week, Sunday first (the same order as `Date.getUTCDay()`). */
export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** One award (GAME_DESIGN §10): the one car with the most / fewest of a stat, past `limit`. */
const AwardRuleSchema = z.strictObject({
  id: z.string().regex(/^[a-zA-Z]+$/),
  title: z.string().min(1),
  /** A trophy emoji shown with the title. */
  icon: z.string().min(1).max(8),
  /** Shown under the title; `{n}` = the number. */
  line: z.string().min(1),
  stat: z.enum(AWARD_STATS),
  pick: z.enum(['most', 'fewest']),
  limit: z.number().min(0),
  finishedOnly: z.boolean(),
});

/** League (GAME_DESIGN §10). */
const LeagueTuningSchema = z.strictObject({
  /** Points for 1st, 2nd, …; every human in the car gets them, bots none; places past the list score 0. */
  pointsByPlace: z.array(z.number().int().min(0)).min(1),
  /** The weekly cup starts on this day (the host PC's local date). */
  weekStartsOn: z.enum(WEEKDAYS),
  /** Braking counts toward the Brake Abuser award only above this speed (m/s). */
  brakeMinSpeed: z.number().min(0),
  /** Awards after each race: at most this many (rules in order), plus the duck. */
  maxAwards: z.number().int().min(0),
  awards: z.array(AwardRuleSchema),
  /** The Rubber Duck of Shame, always for last place. */
  duck: z.strictObject({ title: z.string().min(1), icon: z.string().min(1).max(8), line: z.string().min(1) }),
  /** `npm start` copies data/league.json to data/backups/ once a day and keeps this many copies. */
  backupKeep: z.number().int().min(1),
});

export const TuningSchema = z.strictObject({
  car: CarSchema,
  sim: SimSchema,
  track: TrackBuildSchema,
  bot: BotSchema,
  heat: HeatSchema,
  drift: DriftSchema,
  nitro: NitroSchema,
  solo: SoloSchema,
  race: RaceSchema,
  battle: BattleSchema,
  net: NetSchema,
  camera: CameraSchema,
  quality: QualitySchema,
  league: LeagueTuningSchema,
});

export type Tuning = z.infer<typeof TuningSchema>;
export type CarTuning = Tuning['car'];
export type DriftTuning = Tuning['drift'];
export type NetTuning = Tuning['net'];
export type QualityLevel = Tuning['quality']['default'];
export type LeagueTuning = Tuning['league'];
export type Weekday = (typeof WEEKDAYS)[number];
export type QualityPreset = Tuning['quality']['presets'][QualityLevel];

/** Validate the contents of `config/tuning.json`. Throws `ConfigError` listing every problem. */
export function parseTuning(raw: unknown, source = 'config/tuning.json'): Tuning {
  return parseConfig(TuningSchema, raw, source);
}
