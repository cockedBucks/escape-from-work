import { RingBuffer } from '@escape/shared';

/** Inputs remembered for matching their echo: ~4 s of key changes plus resends. */
const SENT_CAPACITY = 64;

/**
 * Measures input-to-state delay: when an input with `seq` is sent we note the time; when a
 * state patch arrives saying the server applied `seq` (`ackSeq`), the gap is how long a key
 * press takes to come back as car motion (before interpolation adds its own delay).
 */
export class InputDelayMeter {
  private readonly sent = new RingBuffer<{ seq: number; t: number }>(SENT_CAPACITY);
  private lastAck = -1;

  sentInput(seq: number, t: number): void {
    this.sent.push({ seq, t });
  }

  /** Returns the delay (ms) for a newly acknowledged input, or null if nothing new. */
  acked(seq: number, t: number): number | null {
    if (seq <= this.lastAck) return null;
    this.lastAck = seq;
    for (const s of this.sent) if (s.seq === seq) return t - s.t;
    return null;
  }
}

/**
 * Puts server snapshots on a smooth timeline. Arrival times jitter with the network and
 * the browser; the server tick does not. Each snapshot's time = tick × dt + offset, where
 * offset is the smallest (arrival − server time) seen, drifting up slowly so a slower
 * network or clock drift is followed instead of ignored.
 */
export class ServerTimeline {
  private offset: number | null = null;

  constructor(
    private readonly dtMs: number,
    /** How fast the offset may rise per snapshot (ms) when arrivals get later. */
    private readonly relaxMs: number,
  ) {}

  /** Client time to file a snapshot under, given its tick and when it arrived. */
  timeOf(tick: number, arrival: number): number {
    const server = tick * this.dtMs;
    const seen = arrival - server;
    this.offset = this.offset === null ? seen : Math.min(this.offset + this.relaxMs, seen);
    return server + this.offset;
  }
}
