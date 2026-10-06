import { NO_COUNTS, type CarCounts, type RaceRecord, type ResultRow } from '@escape/shared';

/** Who is in a car at the end of the race (names from the room state). */
export interface RecordPlayer {
  name: string;
  slot: number;
  /** 'pilot' | 'engineer' | 'solo' | '' (watching). */
  seat: string;
  /** A networked bot client (scripts/bots): drives like a person, never scores. */
  bot: boolean;
}

export interface RecordInput {
  at: string;
  track: string;
  laps: number;
  chaos: boolean;
  /** One sim tick in ms (ticks → ms). */
  tickMs: number;
  results: readonly ResultRow[];
  teamNames: readonly string[];
  carModels: readonly string[];
  /** Is this car slot driven by a server bot? */
  isBotSlot: (slot: number) => boolean;
  players: readonly RecordPlayer[];
  counts?: ReadonlyMap<number, CarCounts>;
  awards?: RaceRecord['awards'];
}

const SEATS = ['pilot', 'engineer', 'solo'] as const;
type Seat = (typeof SEATS)[number];
const isSeat = (s: string): s is Seat => (SEATS as readonly string[]).includes(s);

/**
 * The league record of a finished race, or null when no person drove (bots only: nothing to
 * score, keep the history clean). A car whose players are all bot clients counts as a bot.
 */
export function raceRecord(input: RecordInput): RaceRecord | null {
  const cars = input.results.map((r) => {
    const slot = Number(r.id.slice('car'.length));
    const inCar = input.players.filter((p) => p.slot === slot && isSeat(p.seat));
    const people = inCar.filter((p) => !p.bot);
    const bot = input.isBotSlot(slot) || people.length === 0;
    return {
      slot,
      team: input.teamNames[slot] ?? `Team ${slot + 1}`,
      car: input.carModels[slot] ?? '',
      bot,
      players: bot ? [] : people.map((p) => ({ name: p.name.trim() || `Player`, seat: p.seat as Seat })),
      place: r.place,
      finished: !r.dnf,
      dnf: r.dnf,
      finishMs: r.timeTicks === null ? 0 : Math.round(r.timeTicks * input.tickMs),
      bestLapMs: r.bestLapTicks === null ? 0 : Math.round(r.bestLapTicks * input.tickMs),
      counts: { ...(input.counts?.get(slot) ?? NO_COUNTS) },
    };
  });
  if (cars.every((c) => c.bot)) return null;
  return { at: input.at, track: input.track, laps: input.laps, chaos: input.chaos, cars, awards: [...(input.awards ?? [])] };
}

/** "2026-10-06T15:30:00.000+03:00": the host PC's local time with its offset (the weekly cup uses the local date). */
export function localIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const local = new Date(d.getTime() + off * 60_000).toISOString().slice(0, 23);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
