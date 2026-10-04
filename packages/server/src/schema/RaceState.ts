import { schema, t, type SchemaType } from '@colyseus/schema';

// Synced state. Declared with schema() instead of decorators: no compiler flags needed.

export const PlayerState = schema(
  {
    name: t.string().default(''),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const RaceState = schema(
  {
    /** Connected players by Colyseus sessionId. */
    players: t.map(PlayerState),
  },
  'RaceState',
);
export type RaceState = SchemaType<typeof RaceState>;
