import { describe, expect, it } from 'vitest';
import { engineTone } from './engine';

describe('engine tone', () => {
  it('rises in pitch and brightness with speed', () => {
    const slow = engineTone(0.2, true, false);
    const fast = engineTone(0.9, true, false);
    expect(fast.hz).toBeGreaterThan(slow.hz);
    expect(fast.cutoff).toBeGreaterThan(slow.cutoff);
  });

  it('is louder on the gas and louder still with a boost or nitro', () => {
    const coast = engineTone(0.5, false, false).level;
    const gas = engineTone(0.5, true, false).level;
    const boost = engineTone(0.5, true, true).level;
    expect(gas).toBeGreaterThan(coast);
    expect(boost).toBeGreaterThan(gas);
  });
});
