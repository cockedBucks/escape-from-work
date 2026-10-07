import type { NetTuning } from '@escape/shared';

/**
 * How far in the past other cars are drawn, sized to the network (P13.1, the friend's
 * "lag and stuttering" on office Wi-Fi). A fixed 50 ms buffer with 33 ms patches runs dry
 * as soon as a patch is ~17 ms late, which Wi-Fi does all the time: the car freezes, then
 * jumps. Here every snapshot reports how late it was (arrival − its smooth timeline time);
 * the delay aims at one patch interval + the 95th-percentile lateness of the last
 * `interpWindow` snapshots + a margin, clamped to [interpDelayMs, interpDelayMaxMs]. It grows
 * fast and shrinks slowly, so the drawn cars only slow down or speed up a little while it moves.
 */
export class AdaptiveDelay {
  private readonly late: number[] = [];
  private next = 0;
  private readonly sorted: number[] = [];
  private target: number;
  /** The delay to draw with now (ms). */
  current: number;
  /** 95th-percentile lateness of recent snapshots (ms), for F3. */
  jitterMs = 0;

  constructor(private net: NetTuning) {
    this.current = net.interpDelayMs;
    this.target = net.interpDelayMs;
  }

  setTuning(net: NetTuning): void {
    this.net = net;
    this.retarget();
    this.current = Math.min(Math.max(this.current, net.interpDelayMs), net.interpDelayMaxMs);
  }

  /** A snapshot arrived `lateMs` after its timeline time. */
  onSnapshot(lateMs: number): void {
    const size = this.net.interpWindow;
    if (this.late.length > size) this.late.length = size; // the window was made smaller
    if (this.next >= size) this.next = 0;
    if (this.late.length < size) this.late.push(Math.max(lateMs, 0));
    else this.late[this.next] = Math.max(lateMs, 0);
    this.next = (this.next + 1) % size;
    this.retarget();
  }

  private retarget(): void {
    const n = this.late.length;
    const s = this.sorted;
    s.length = 0;
    for (let i = 0; i < n; i++) s.push(this.late[i]!);
    s.sort((a, b) => a - b);
    this.jitterMs = n === 0 ? 0 : s[Math.min(n - 1, Math.floor(0.95 * n))]!;
    const want = this.net.patchRateMs + this.jitterMs + this.net.interpMarginMs;
    this.target = Math.min(Math.max(want, this.net.interpDelayMs), this.net.interpDelayMaxMs);
  }

  /** Move toward the target for a frame of `dtMs`; returns the delay to draw with. */
  update(dtMs: number): number {
    const dt = Math.max(dtMs, 0) / 1000;
    if (this.target > this.current) this.current = Math.min(this.target, this.current + this.net.interpGrowPerSec * dt);
    else this.current = Math.max(this.target, this.current - this.net.interpShrinkPerSec * dt);
    return this.current;
  }
}
