import { schema, t, type SchemaType } from '@colyseus/schema';

// Synced state. Declared with schema() instead of decorators: no compiler flags needed.

export const PlayerState = schema(
  {
    name: t.string().default(''),
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
  },
  'RaceState',
);
export type RaceState = SchemaType<typeof RaceState>;
