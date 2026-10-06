import { schema, t, type SchemaType } from '@colyseus/schema';

// Synced state. Declared with schema() instead of decorators: no compiler flags needed.

export const PlayerState = schema(
  {
    name: t.string().default(''),
    /** Car slot (0-based), or -1 when watching. */
    slot: t.int8().default(-1),
    /** Chosen seat: 'pilot' | 'engineer' | 'solo', or '' when not in a car. */
    seat: t.string().default(''),
    /** What they control right now ('solo' when alone in the car), '' when not in a car. */
    role: t.string().default(''),
    /** False while disconnected and their seat is held (P2.4). */
    connected: t.boolean().default(true),
    /** Bobblehead face: a file in assets/faces/ (served at /faces/), '' = drawn placeholder. */
    face: t.string().default(''),
    /** Where the player looks in the cockpit, relative to the car (rad): drives their bobblehead. */
    headYaw: t.float32().default(0),
    headPitch: t.float32().default(0),
    /** Pressed Ready in the lobby. */
    ready: t.boolean().default(false),
    /** Last input `seq` the server applied, so the client can measure input delay (-1 = none). */
    ackSeq: t.int32().default(-1),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

/** What clients need to draw one car. Copied from the sim after every tick. */
export const CarView = schema(
  {
    x: t.float32().default(0),
    z: t.float32().default(0),
    /** Height above the ground (jumps). */
    y: t.float32().default(0),
    yaw: t.float32().default(0),
    /** Ground speed (m/s), for the HUD and engine sound. */
    speed: t.float32().default(0),
    /** Smoothed steering -1..1, for turning the front wheels. */
    steer: t.float32().default(0),
    /** Lap progress 0–1. */
    progress: t.float32().default(0),
    /** Velocity (m/s) and vertical speed: lets a client predict its own car from this state. */
    vx: t.float32().default(0),
    vz: t.float32().default(0),
    vy: t.float32().default(0),
    /** Driven by a server bot (no players in it). */
    bot: t.boolean().default(false),
    /** Race info (0 / false outside a race): laps completed, place (1 = leading). */
    lapsDone: t.uint8().default(0),
    place: t.uint8().default(0),
    finished: t.boolean().default(false),
    dnf: t.boolean().default(false),
    wrongWay: t.boolean().default(false),
    /** Race time at the finish and best lap (ms, 0 = none yet). */
    finishMs: t.uint32().default(0),
    /** Time behind the leader at the last sector both passed (ms). */
    gapMs: t.uint32().default(0),
    bestLapMs: t.uint32().default(0),
    /** The merged input the server applied this tick (prediction uses the partner's half). */
    inSteer: t.float32().default(0),
    inGas: t.boolean().default(false),
    inBrake: t.boolean().default(false),
    inNitro: t.boolean().default(false),
    /** Fading out before a respawn. */
    respawning: t.boolean().default(false),
    /** Ghosted after a respawn (drawn see-through). */
    ghost: t.boolean().default(false),
    /** Engine heat 0–1, and seconds until a stalled engine restarts (0 = running). */
    heat: t.float32().default(0),
    stallLeft: t.float32().default(0),
    /** Drift: -1 left / 0 none / +1 right, level 0–3, seconds charged; boost seconds left; nitro 0–1. */
    drift: t.int8().default(0),
    driftLevel: t.uint8().default(0),
    driftCharge: t.float32().default(0),
    boostLeft: t.float32().default(0),
    /** Seconds the steering has been straight in this drift (it lets go at drift.releaseMs). */
    driftStraight: t.float32().default(0),
    /** Inside a swap lane (slower): lets prediction match the server there. */
    onSwap: t.boolean().default(false),
    nitro: t.float32().default(0),
    /** Burning nitro now (flames). */
    nitroOn: t.boolean().default(false),
    /** One player drives alone (the optional solo handicap applies). */
    solo: t.boolean().default(false),
    /** The held item id ('' = empty slot). */
    item: t.string().default(''),
    /** Seconds left spinning out (item hit) and of Firewall (0 = none). */
    spinLeft: t.float32().default(0),
    shieldLeft: t.float32().default(0),
    /** Item effects on this car, seconds left: Blue Screen, Lag Spike, Control Swap, Forced Update. */
    blueLeft: t.float32().default(0),
    lagLeft: t.float32().default(0),
    swapLeft: t.float32().default(0),
    updateLeft: t.float32().default(0),
  },
  'CarView',
);
export type CarView = SchemaType<typeof CarView>;

/** A flying Reply-All envelope ('mail') or a Coffee Spill puddle ('coffee'). */
export const ShotView = schema(
  {
    kind: t.string().default(''),
    x: t.float32().default(0),
    z: t.float32().default(0),
    /** Velocity (m/s): clients move envelopes between patches. */
    vx: t.float32().default(0),
    vz: t.float32().default(0),
  },
  'ShotView',
);
export type ShotView = SchemaType<typeof ShotView>;

export const RaceState = schema(
  {
    /** Connected players by Colyseus sessionId. */
    players: t.map(PlayerState),
    /** Cars by id (for now: the sessionId of the solo player driving it). */
    cars: t.map(CarView),
    /** Race phase: 'lobby' | 'countdown' | 'racing' | 'results'. */
    phase: t.string().default('lobby'),
    /** Tick the phase began (with `tick` and race.countdownSeconds, clients show the countdown). */
    phaseTick: t.uint32().default(0),
    /** Player id of the host ('' when nobody is here). */
    host: t.string().default(''),
    /** Laps for the next / current race. */
    laps: t.uint8().default(3),
    /** Team name per car slot. */
    teams: t.array('string'),
    /** Host switch: bots fill empty cars. */
    bots: t.boolean().default(false),
    /** Host switch: chaos mode (item boxes and items). */
    chaos: t.boolean().default(true),
    /** Item boxes in track order: '1' = there, '0' = broken (respawning). Empty = chaos off. */
    boxesUp: t.string().default(''),
    /** Envelopes and puddles by id ('m12', 'c13'). */
    shots: t.map(ShotView),
    /** Sim tick of the state being sent (clients use it to order snapshots). */
    tick: t.uint32().default(0),
    /** Server cost of one sim tick (ms, smoothed), for the F3 overlay. */
    tickMs: t.float32().default(0),
    /** Slowest and average sim tick during the current/last race (ms), for load tests. */
    tickMsMax: t.float32().default(0),
    tickMsAvg: t.float32().default(0),
    /** Racing ticks so far, and how many took longer than one tick slot (sim.dt). */
    raceTicks: t.uint32().default(0),
    tickOverBudget: t.uint32().default(0),
  },
  'RaceState',
);
export type RaceState = SchemaType<typeof RaceState>;
