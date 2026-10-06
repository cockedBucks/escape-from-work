import { z } from 'zod';
import { parseConfig } from './parse';

// Track data format (docs/ARCHITECTURE.md §5). Zone positions and `start.at` are fractions
// (0–1) of the loop length measured from control point 0, so they survive layout edits.
// A zone may not wrap past control point 0 (from < to); split it into two if it has to.

const progress = () => z.number().min(0).max(1);

const PointSchema = z.strictObject({
  x: z.number(),
  z: z.number(),
  /** Road width at this point (m). */
  width: z.number().positive(),
});

const RampZoneSchema = z.strictObject({
  type: z.literal('ramp'),
  from: progress(),
  to: progress(),
  /** Multiplies `car.rampLaunch`. */
  launch: z.number().positive(),
  /** What it looks like (the jump is the same): a wooden ramp or a sand dune. */
  look: z.enum(['wood', 'dune']).default('wood'),
});

const SlickZoneSchema = z.strictObject({
  type: z.literal('slick'),
  from: progress(),
  to: progress(),
  side: z.enum(['left', 'right', 'both']),
  /** What it looks like (the grip loss is the same): a coffee spill or an icy floor. */
  look: z.enum(['coffee', 'ice']).default('coffee'),
});

/** A giant cooling fan: shoves every car on this stretch sideways (the whole road width). */
const PushZoneSchema = z.strictObject({
  type: z.literal('push'),
  from: progress(),
  to: progress(),
  /** The way it blows, relative to the direction of travel. */
  toward: z.enum(['left', 'right']),
  /** Sideways acceleration while inside (m/s²). */
  strength: z.number().positive().max(40),
});

const SwapZoneSchema = z.strictObject({
  type: z.literal('swap'),
  from: progress(),
  to: progress(),
  side: z.enum(['left', 'right']),
  /** First lap the swap lane is open. */
  minLap: z.number().int().min(1),
});

const ItemRowZoneSchema = z.strictObject({
  type: z.literal('itemRow'),
  at: progress(),
  count: z.number().int().min(1),
});

const ZoneSchema = z.discriminatedUnion('type', [
  RampZoneSchema,
  SlickZoneSchema,
  PushZoneSchema,
  SwapZoneSchema,
  ItemRowZoneSchema,
]);

/** Prop kit pieces (ART_STYLE §5); the client builds them. Office, server room, then oasis sets. */
export const PROP_KITS = [
  'desk', 'chair', 'cubicle', 'monitor', 'keyboard', 'printer', 'waterCooler', 'coffeeMachine',
  'plant', 'whiteboard', 'filingCabinet', 'reception',
  'serverRack', 'cableTray', 'coolingFan', 'acUnit',
  'palm', 'dune', 'rock', 'tent', 'pond',
] as const;
export type PropKit = (typeof PROP_KITS)[number];

/**
 * A shortcut: an open spline that leaves the main loop at progress `from` and rejoins it at
 * `to`, through its own control points. Its progress maps linearly onto from..to, so laps,
 * sectors and places work unchanged. Walls open where the two roads overlap.
 */
const BranchSchema = z.strictObject({
  name: z.string().min(1),
  from: progress(),
  to: progress(),
  /** Control points between the two junctions (the junction ends come from the main loop). */
  points: z.array(PointSchema).min(1),
});

const PropSchema = z.strictObject({
  /** Prop kit piece (ART_STYLE §5). */
  kit: z.enum(PROP_KITS),
  x: z.number(),
  z: z.number(),
  /** Yaw in radians. */
  rot: z.number(),
});

export const TrackSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes'),
    name: z.string().min(1),
    theme: z.string().min(1),
    laps: z.number().int().min(1),
    /** Control points of a closed Catmull-Rom spline, clockwise seen from above. */
    points: z.array(PointSchema).min(4),
    /** Number of sector gates (checkpoints) around the lap. */
    sectors: z.number().int().min(2),
    zones: z.array(ZoneSchema),
    props: z.array(PropSchema),
    start: z.strictObject({ at: progress() }),
    /** Shortcuts (branch splines); see BranchSchema. */
    branches: z.array(BranchSchema).default([]),
    /** Dev-only track (greybox): `track:check` skips the lap-time target. */
    dev: z.boolean().default(false),
    /** A sandstorm (thick fog) for one whole lap: while the race leader is on lap `lap`. */
    sandstorm: z
      .strictObject({
        lap: z.number().int().min(1),
        /** Fog start and full-fog distances while it blows (m). */
        fogNear: z.number().min(0),
        fogFar: z.number().positive(),
      })
      .refine((s) => s.fogNear < s.fogFar, { message: 'fogNear must be less than fogFar', path: ['fogFar'] })
      .optional(),
  })
  .superRefine((track, ctx) => {
    track.zones.forEach((zone, i) => {
      if ('from' in zone && zone.from >= zone.to) {
        ctx.addIssue({
          code: 'custom',
          path: ['zones', i, 'to'],
          message: `"to" (${zone.to}) must be greater than "from" (${zone.from})`,
        });
      }
    });
    track.branches.forEach((b, i) => {
      if (b.from >= b.to) {
        ctx.addIssue({
          code: 'custom',
          path: ['branches', i, 'to'],
          message: `"to" (${b.to}) must be greater than "from" (${b.from})`,
        });
      }
    });
  });

export type TrackDef = z.infer<typeof TrackSchema>;
export type TrackPoint = TrackDef['points'][number];
export type TrackZone = TrackDef['zones'][number];
export type TrackBranchDef = TrackDef['branches'][number];

/** Validate the contents of a `config/tracks/<id>.json` file. */
export function parseTrack(raw: unknown, source: string): TrackDef {
  return parseConfig(TrackSchema, raw, source);
}
