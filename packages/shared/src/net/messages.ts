import { z } from 'zod';
import { clamp } from '../util/math';
import { TEAM_NAME_MAX_LENGTH } from '../config/teams';
import { SEATS } from '../race/seats';
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
  /** client → server: `{ yaw, pitch }` head angles (cockpit look), ~20/s. */
  head: 'head',
  /** client → server: `{ name }`. */
  setName: 'lobby:setName',
  /** client → server: `{ slot, seat }`. */
  setSeat: 'lobby:setSeat',
  /** client → server: leave your seat and watch. */
  leaveSeat: 'lobby:leaveSeat',
  /** client → server: `{ slot, name }` rename a team (its players or the host). */
  setTeamName: 'lobby:setTeamName',
  /** client → server: `{ ready }`. */
  ready: 'lobby:ready',
  /** client (host) → server: random pairs for everyone. */
  hostShuffle: 'host:shuffle',
  /** client (host) → server: `{ on }` bots fill empty cars. */
  hostBots: 'host:bots',
  /** client (host) → server: start the race / rematch. */
  hostStart: 'host:start',
  /** client (host) → server: `{ laps }` for the next race. */
  hostLaps: 'host:laps',
  /** client (host) → server: stop the race now (countdown → lobby, racing → results with DNFs). */
  hostEndRace: 'host:endRace',
  /** client (host) → server: from the results back to the lobby. */
  hostLobby: 'host:lobby',
  /** server → one client: `{ reason }` when a lobby request was refused. */
  lobbyError: 'lobby:error',
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

/** Longest player name shown in the join screen and HUD. */
export const NAME_MAX_LENGTH = 16;

/** `lobby:setName` (client → server). Whitespace is trimmed; empty names are refused. */
export const SetNameSchema = z.strictObject({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
});

/** `lobby:setSeat` (client → server): take a seat in a car slot (rules in race/seats.ts). */
export const SetSeatSchema = z.strictObject({
  slot: z.number().int().nonnegative(),
  seat: z.enum(SEATS),
});

/** `lobby:error` (server → one client): why a lobby request was refused. */
export interface LobbyError {
  reason: string;
}

/** `host:laps` (client → server). Range is checked against the config by the race rules. */
export const SetLapsSchema = z.strictObject({
  laps: z.number().int(),
});

/** `lobby:setTeamName` (client → server). */
export const SetTeamNameSchema = z.strictObject({
  slot: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(TEAM_NAME_MAX_LENGTH),
});

/** `lobby:ready` (client → server). */
export const ReadySchema = z.strictObject({ ready: z.boolean() });

/** `host:bots` (client → server). */
export const BotsSchema = z.strictObject({ on: z.boolean() });

/** `head` (client → server, ~20/s in the cockpit): where your head points, relative to the car. */
export const HeadSchema = z.strictObject({
  yaw: z.number().finite(),
  pitch: z.number().finite(),
});

/**
 * Validate a head message and clamp it to the head limits (`camera.headYawLimit/PitchLimit`).
 * Null for anything malformed (the server drops it).
 */
export function parseHead(raw: unknown, limits: { headYawLimit: number; headPitchLimit: number }): { yaw: number; pitch: number } | null {
  const r = HeadSchema.safeParse(raw);
  if (!r.success) return null;
  return {
    yaw: clamp(r.data.yaw, -limits.headYawLimit, limits.headYawLimit),
    pitch: clamp(r.data.pitch, -limits.headPitchLimit, limits.headPitchLimit),
  };
}
