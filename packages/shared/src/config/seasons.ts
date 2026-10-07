import { z } from 'zod';
import { parseConfig } from './parse';

/** Seasonal decoration pieces (P11.3); the client builds them. Original shapes only. */
export const DECOR_KITS = ['snowman', 'giftBox', 'pineTree', 'pumpkin', 'sheetGhost', 'candle', 'lantern', 'crescent', 'balloons'] as const;
export type DecorKit = (typeof DECOR_KITS)[number];

/** "MM-DD" (every year) or "YYYY-MM-DD" (that day only). */
const DAY = /^(\d{4}-)?(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const DateRangeSchema = z
  .strictObject({ from: z.string().regex(DAY, 'use MM-DD or YYYY-MM-DD'), to: z.string().regex(DAY, 'use MM-DD or YYYY-MM-DD') })
  .refine((r) => r.from.length === r.to.length, 'from and to must both be MM-DD or both YYYY-MM-DD')
  .refine((r) => r.from.length === 5 || r.from <= r.to, 'a dated range must not end before it starts');

const SeasonSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes'),
  /** Shown in Settings. */
  name: z.string().min(1),
  /** Inclusive day ranges (host-free: each page uses its own date). A MM-DD range may wrap the year end. */
  dates: z.array(DateRangeSchema).min(1),
  kits: z.array(z.enum(DECOR_KITS)).min(1),
  /** Falling snow on every screen. */
  snow: z.boolean().default(false),
});

/** `config/seasons.json`: holiday decorations beside every track. */
export const SeasonsSchema = z
  .strictObject({
    decorations: z.strictObject({
      /** Pieces around one lap (fewer when there is no room). */
      perTrack: z.number().int().min(1).max(200),
      /** Gap between the road edge and a piece (m). */
      edgeGap: z.number().min(0).max(20),
      /** Keep this far from the track's own props (m, center to center beyond both sizes). */
      propGap: z.number().min(0).max(20),
    }),
    seasons: z.array(SeasonSchema),
  })
  .refine((c) => new Set(c.seasons.map((s) => s.id)).size === c.seasons.length, 'season ids must be unique');

export type SeasonsConfig = z.infer<typeof SeasonsSchema>;
export type Season = SeasonsConfig['seasons'][number];

export function parseSeasons(raw: unknown, source = 'config/seasons.json'): SeasonsConfig {
  return parseConfig(SeasonsSchema, raw, source);
}

/** Is `season` on for the local day `day` ("YYYY-MM-DD")? */
export function seasonOn(season: Season, day: string): boolean {
  const md = day.slice(5);
  return season.dates.some(({ from, to }) => {
    if (from.length > 5) return from <= day && day <= to;
    return from <= to ? from <= md && md <= to : md >= from || md <= to;
  });
}

/** The first season (config order) on for `day`, or null. */
export function activeSeason(cfg: SeasonsConfig, day: string): Season | null {
  return cfg.seasons.find((s) => seasonOn(s, day)) ?? null;
}
