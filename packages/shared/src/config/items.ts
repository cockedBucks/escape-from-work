import { z } from 'zod';
import { parseConfig } from './parse';

// Chaos items (GAME_DESIGN §7): item box settings, the roll table by race position, and each
// item's numbers. Validated here; every gameplay number for items lives in config/items.json.

export const ITEM_IDS = ['replyAll', 'firewall', 'coffeeSpill', 'ctrlZ', 'blueScreen', 'lagSpike', 'controlSwap', 'forcedUpdate'] as const;
export type ItemId = (typeof ITEM_IDS)[number];

const pos = () => z.number().positive();
const nonNeg = () => z.number().nonnegative();

/** One position bucket's roll weights: every item, summing to 100. */
const WeightsSchema = z
  .strictObject(Object.fromEntries(ITEM_IDS.map((id) => [id, nonNeg()])) as Record<ItemId, ReturnType<typeof nonNeg>>)
  .refine((w) => Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 100) < 1e-9, 'weights must sum to 100');

export const ItemsSchema = z.strictObject({
  boxes: z.strictObject({
    /** A car picks up a box within this distance of its center (m). */
    radius: pos(),
    /** A taken box comes back after this long (s). */
    respawnSeconds: pos(),
  }),
  /** A spin-out (Reply-All, Coffee Spill): turns per second and speed lost (share per second). */
  spin: z.strictObject({ turnsPerSec: pos(), slowPerSec: pos() }),
  /** Roll weights by race position: front = top 25%, back = bottom 25%, mid = the rest. */
  roll: z.strictObject({ front: WeightsSchema, mid: WeightsSchema, back: WeightsSchema }),
  items: z.strictObject({
    replyAll: z.strictObject({
      /** Envelope speed (m/s), life (s), wall bounces, hit radius (m), spin-out time (s). */
      speed: pos(),
      lifeSeconds: pos(),
      bounces: z.number().int().nonnegative(),
      radius: pos(),
      spinSeconds: pos(),
      /** Starts this far in front of (or behind) the car (m); can't hit its sender for this long (s). */
      spawnAhead: pos(),
      armSeconds: nonNeg(),
    }),
    firewall: z.strictObject({ seconds: pos() }),
    coffeeSpill: z.strictObject({
      /** Puddle life (s), radius (m), spin-out time (s), dropped this far behind the car (m). */
      seconds: pos(),
      radius: pos(),
      spinSeconds: pos(),
      dropBack: nonNeg(),
      /** The car that dropped it can't slip on it for this long (s). */
      ownerGraceSeconds: nonNeg(),
    }),
    ctrlZ: z.strictObject({ seconds: pos() }),
    blueScreen: z.strictObject({ seconds: pos() }),
    lagSpike: z.strictObject({ seconds: pos(), delaySeconds: pos() }),
    controlSwap: z.strictObject({ seconds: pos() }),
    forcedUpdate: z.strictObject({
      /** Longest the car is stopped (s); each key mash takes this much off (s). */
      maxSeconds: pos(),
      mashSeconds: pos(),
    }),
  }),
});

export type ItemsConfig = z.infer<typeof ItemsSchema>;
export type RollBucket = keyof ItemsConfig['roll'];

/** Validate the contents of `config/items.json`. Throws `ConfigError` listing every problem. */
export function parseItems(raw: unknown, source = 'config/items.json'): ItemsConfig {
  return parseConfig(ItemsSchema, raw, source);
}
