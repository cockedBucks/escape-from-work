import { z } from 'zod';
import { clamp } from '../util/math';
import type { CarInput } from '../sim/types';

/** Message type names, shared by client and server so they cannot drift apart. */
export const MSG = {
  /** client → server: the player's current controls. */
  input: 'input',
  /** server → clients: sim events from one tick (`SimEvent[]`). */
  events: 'events',
  /** server → clients: the full current tuning (on join and after every live change). */
  tuning: 'tuning',
  /** server → clients (dev): a track or car file changed; reload the page to rebuild it. */
  reload: 'reload',
} as const;

/**
 * `input` (client → server). The client sends its full control state whenever it changes
 * (and every so often). `seq` grows by one per message so stale, reordered ones are dropped.
 * Pilot/Engineer role filtering arrives in P2; for now every player drives solo.
 */
export const InputMessageSchema = z.strictObject({
  seq: z.number().int().nonnegative(),
  /** -1 left, 0 straight, +1 right. Anything in between is clamped, never rejected. */
  steer: z.number().finite().optional(),
  gas: z.boolean().optional(),
  brake: z.boolean().optional(),
  respawn: z.boolean().optional(),
});

export type InputMessage = z.infer<typeof InputMessageSchema>;

/** Validate a raw client message. Returns null for anything malformed (the server drops it). */
export function parseInputMessage(raw: unknown): InputMessage | null {
  const r = InputMessageSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Turn a validated message into sim input, clamping ranges. */
export function toCarInput(msg: InputMessage): CarInput {
  return {
    steer: clamp(msg.steer ?? 0, -1, 1),
    gas: msg.gas ?? false,
    brake: msg.brake ?? false,
    respawn: msg.respawn ?? false,
  };
}

/** Dev-only `POST /dev/tuning` body from the F2 panel. `tuning` is checked by the tuning schema. */
export const TuningPostSchema = z.strictObject({
  tuning: z.unknown(),
  /** true = also write config/tuning.json; false = live preview only. */
  save: z.boolean(),
});
