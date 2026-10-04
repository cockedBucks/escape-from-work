import { z } from 'zod';
import { parseConfig } from './parse';

// Strict objects: an unknown key (usually a typo) is an error, not silently ignored.

const SimSchema = z.strictObject({
  /** Fixed sim timestep in seconds (1/60). */
  dt: z.number().positive().max(0.1),
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
});

export const TuningSchema = z.strictObject({
  sim: SimSchema,
  net: NetSchema,
});

export type Tuning = z.infer<typeof TuningSchema>;

/** Validate the contents of `config/tuning.json`. Throws `ConfigError` listing every problem. */
export function parseTuning(raw: unknown, source = 'config/tuning.json'): Tuning {
  return parseConfig(TuningSchema, raw, source);
}
