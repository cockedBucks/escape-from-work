import { describe, expect, it } from 'vitest';
import { InputDelayMeter, ServerTimeline } from './latency';

describe('InputDelayMeter', () => {
  it('measures send-to-ack time once per new ack', () => {
    const m = new InputDelayMeter();
    m.sentInput(1, 100);
    m.sentInput(2, 150);
    expect(m.acked(1, 130)).toBe(30);
    expect(m.acked(1, 200)).toBeNull(); // same ack again
    expect(m.acked(2, 190)).toBe(40);
    expect(m.acked(1, 300)).toBeNull(); // older
  });

  it('returns null for an ack it never saw sent (e.g. after a reload)', () => {
    expect(new InputDelayMeter().acked(9, 100)).toBeNull();
  });
});

describe('ServerTimeline', () => {
  it('ignores arrival jitter: evenly spaced ticks stay evenly spaced', () => {
    const tl = new ServerTimeline(1000 / 60, 0.5);
    // Patches every 2 ticks (33 ms), arriving 5-25 ms late at random-ish amounts.
    const jitter = [5, 25, 8, 20, 6, 22];
    const times = jitter.map((j, i) => tl.timeOf(i * 2, 1000 + (i * 2 * 1000) / 60 + j));
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThan(30);
      expect(times[i]! - times[i - 1]!).toBeLessThan(37);
    }
  });

  it('follows a network that becomes slower, a little per snapshot', () => {
    const tl = new ServerTimeline(10, 1);
    tl.timeOf(0, 100); // offset 100
    const t = tl.timeOf(1, 160); // seen 150: offset may only rise by 1
    expect(t).toBe(10 + 101);
    expect(tl.timeOf(2, 115)).toBe(115); // faster arrival: snaps down at once
  });
});
