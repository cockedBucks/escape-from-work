import { describe, expect, it } from 'vitest';
import { loadTuning } from '../content';
import { AdaptiveDelay } from './adaptiveDelay';

const net = loadTuning().net;

describe('AdaptiveDelay', () => {
  it('stays at the minimum on a clean network', () => {
    const d = new AdaptiveDelay(net);
    for (let i = 0; i < 100; i++) d.onSnapshot(2);
    for (let i = 0; i < 300; i++) d.update(16);
    expect(d.current).toBe(Math.max(net.interpDelayMs, net.patchRateMs + 2 + net.interpMarginMs));
  });

  it('grows to cover Wi-Fi jitter (patch interval + p95 lateness + margin), within the max', () => {
    const d = new AdaptiveDelay(net);
    // Every 10th patch is 60 ms late: the p95 sees it.
    for (let i = 0; i < net.interpWindow; i++) d.onSnapshot(i % 10 === 0 ? 60 : 5);
    expect(d.jitterMs).toBe(60);
    for (let i = 0; i < 300; i++) d.update(16);
    expect(d.current).toBeCloseTo(Math.min(net.patchRateMs + 60 + net.interpMarginMs, net.interpDelayMaxMs));
    for (let i = 0; i < net.interpWindow; i++) d.onSnapshot(10_000);
    for (let i = 0; i < 1000; i++) d.update(16);
    expect(d.current).toBe(net.interpDelayMaxMs);
  });

  it('moves gently: grows at interpGrowPerSec and shrinks at the slower interpShrinkPerSec', () => {
    const d = new AdaptiveDelay(net);
    const start = d.current;
    for (let i = 0; i < net.interpWindow; i++) d.onSnapshot(150);
    d.update(100);
    expect(d.current - start).toBeCloseTo(net.interpGrowPerSec * 0.1);
    for (let i = 0; i < 1000; i++) d.update(16);
    const high = d.current;
    for (let i = 0; i < net.interpWindow; i++) d.onSnapshot(0);
    d.update(100);
    expect(high - d.current).toBeCloseTo(net.interpShrinkPerSec * 0.1);
  });
});
