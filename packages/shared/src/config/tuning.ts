import { z } from 'zod';
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
  /** Engineer: lets go of the gas at this engine heat (0–1) so the engine never stalls. */
  heatLiftAt: z.number().min(0).max(1),
});

/** Engine heat (GAME_DESIGN §5): the Engineer's main decision. Heat is 0–1 (1 = stall). */
const HeatSchema = z.strictObject({
  /** Heat rises only at full gas above this share of the car's top speed (0–1). */
  hotSpeedFraction: z.number().min(0).max(1),
  /** Heat gained per second at full gas and speed (0.25 = +25%/s). */
  risePerSec: nonNeg(),
  /** Heat lost per second off the gas or braking. */
  coolPerSec: nonNeg(),
  /** At full heat the engine stalls (no gas) for this long (s)... */
  stallSeconds: nonNeg(),
  /** ...then restarts at this heat (0–1). */
  restartHeat: z.number().min(0).max(1),
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
  carMaxDrawCalls: z.number().int().positive(),
});

const NetSchema = z.strictObject({
  /** Port for the page and the multiplayer server. */
  port: z.number().int().min(1).max(65535),
  /** How often the server sends state patches to clients. */
  patchRateMs: z.number().int().positive(),
  /** How far in the past clients render, so they can interpolate between patches. */
  interpDelayMs: z.number().int().nonnegative(),
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
});

export const TuningSchema = z.strictObject({
  car: CarSchema,
  sim: SimSchema,
  track: TrackBuildSchema,
  bot: BotSchema,
  heat: HeatSchema,
  race: RaceSchema,
  net: NetSchema,
  camera: CameraSchema,
  quality: QualitySchema,
});

export type Tuning = z.infer<typeof TuningSchema>;
export type CarTuning = Tuning['car'];
export type QualityLevel = Tuning['quality']['default'];
export type QualityPreset = Tuning['quality']['presets'][QualityLevel];

/** Validate the contents of `config/tuning.json`. Throws `ConfigError` listing every problem. */
export function parseTuning(raw: unknown, source = 'config/tuning.json'): Tuning {
  return parseConfig(TuningSchema, raw, source);
}
