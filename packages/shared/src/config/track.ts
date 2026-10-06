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
});

const SlickZoneSchema = z.strictObject({
  type: z.literal('slick'),
  from: progress(),
  to: progress(),
  side: z.enum(['left', 'right', 'both']),
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
  SwapZoneSchema,
  ItemRowZoneSchema,
]);

/** Prop kit pieces (ART_STYLE §5); the client builds them. Office set for now. */
export const PROP_KITS = [
  'desk', 'chair', 'cubicle', 'monitor', 'keyboard', 'printer', 'waterCooler', 'coffeeMachine',
  'plant', 'whiteboard', 'filingCabinet', 'reception',
] as const;
export type PropKit = (typeof PROP_KITS)[number];

const PropSchema = z.strictObject({
  /** Prop kit piece (ART_STYLE §5). */
  kit: z.enum(PROP_KITS),
  x: z.number(),
  z: z.number(),
  /** Yaw in radians. */
  rot: z.number(),
});

/**
 * A shortcut: an open spline that leaves the main loop at `from` and rejoins it at `to`
 * (progress, from < to). `points` are the control points in between; the builder adds the
 * two junctions on the main centerline. Progress on a shortcut maps linearly onto from–to.
 */
const ShortcutSchema = z.strictObject({
  from: progress(),
  to: progress(),
  points: z.array(PointSchema).min(1),
});

export const TrackSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes'),
    name: z.string().min(1),
    theme: z.string().min(1),
    /** Dev-only track (Test Loop): exempt from the lap-time target in `track:check`. */
    dev: z.boolean().default(false),
    laps: z.number().int().min(1),
    /** Control points of a closed Catmull-Rom spline, clockwise seen from above. */
    points: z.array(PointSchema).min(4),
    /** Number of sector gates (checkpoints) around the lap. */
    sectors: z.number().int().min(2),
    zones: z.array(ZoneSchema),
    shortcuts: z.array(ShortcutSchema).default([]),
    props: z.array(PropSchema),
    start: z.strictObject({ at: progress() }),
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
    track.shortcuts.forEach((cut, i) => {
      if (cut.from >= cut.to) {
        ctx.addIssue({
          code: 'custom',
          path: ['shortcuts', i, 'to'],
          message: `"to" (${cut.to}) must be greater than "from" (${cut.from})`,
        });
      }
    });
  });

export type TrackDef = z.infer<typeof TrackSchema>;
export type TrackPoint = TrackDef['points'][number];
export type TrackZone = TrackDef['zones'][number];
export type TrackShortcut = TrackDef['shortcuts'][number];

/** Validate the contents of a `config/tracks/<id>.json` file. */
export function parseTrack(raw: unknown, source: string): TrackDef {
  return parseConfig(TrackSchema, raw, source);
}
