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
    /** The merged input the server applied this tick (prediction uses the partner's half). */
    inSteer: t.float32().default(0),
    inGas: t.boolean().default(false),
    inBrake: t.boolean().default(false),
    /** Fading out before a respawn. */
    respawning: t.boolean().default(false),
    /** Ghosted after a respawn (drawn see-through). */
    ghost: t.boolean().default(false),
  },
  'CarView',
);
export type CarView = SchemaType<typeof CarView>;

export const RaceState = schema(
  {
    /** Connected players by Colyseus sessionId. */
    players: t.map(PlayerState),
    /** Cars by id (for now: the sessionId of the solo player driving it). */
    cars: t.map(CarView),
    /** Sim tick of the state being sent (clients use it to order snapshots). */
    tick: t.uint32().default(0),
    /** Server cost of one sim tick (ms, smoothed), for the F3 overlay. */
    tickMs: t.float32().default(0),
  },
  'RaceState',
);
export type RaceState = SchemaType<typeof RaceState>;
