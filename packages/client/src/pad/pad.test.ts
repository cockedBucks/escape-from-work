import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputMessage } from '@escape/shared';
import { PadControls } from './padControls';
import { padButtons } from './padLayout';

describe('phone controller (P11.5)', () => {
  it('each role gets only its own controls (the same split as the keyboard)', () => {
    const actions = (role: string): string[] => padButtons(role).map((b) => b.action).sort();
    expect(actions('pilot')).toEqual(['aimBack', 'honk', 'left', 'respawn', 'right', 'space']);
    expect(actions('engineer')).toEqual(['brake', 'gas', 'honk', 'item', 'nitro', 'respawn']);
    expect(actions('solo')).toEqual(['aimBack', 'brake', 'gas', 'honk', 'item', 'left', 'nitro', 'respawn', 'right', 'space']);
    expect(padButtons('')).toEqual([]);
    // Thumbs: steering on the left, gas on the right.
    expect(padButtons('solo').find((b) => b.action === 'gas')?.zone).toBe('right');
    expect(padButtons('pilot').find((b) => b.action === 'left')?.zone).toBe('left');
    expect(padButtons('pilot').find((b) => b.action === 'space')?.zone).toBe('right'); // DRIFT under the right thumb
  });

  describe('touch buttons', () => {
    beforeEach(() => {
      vi.stubGlobal('window', { setInterval: () => 1, clearInterval: () => {} });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('hold while any finger is down, send the same message as the keyboard, count taps as mashing', () => {
      const sent: InputMessage[] = [];
      const pad = new PadControls((m) => sent.push(m), 100);
      pad.press('gas', 1);
      expect(sent.at(-1)).toMatchObject({ gas: true, steer: 0, mash: 1 });
      pad.press('gas', 2); // second thumb on the same button
      pad.release('gas', 1);
      expect(sent.at(-1)?.gas).toBe(true);
      pad.release('gas', 2);
      expect(sent.at(-1)?.gas).toBe(false);
      pad.press('left', 3);
      expect(sent.at(-1)).toMatchObject({ steer: -1, mash: 3 });
      pad.releaseAll();
      expect(sent.at(-1)?.steer).toBe(0);
      expect(sent.map((m) => m.seq)).toEqual(sent.map((_, i) => i + 1));
    });

    it('releasing a finger that was never down sends nothing', () => {
      const sent: InputMessage[] = [];
      const pad = new PadControls((m) => sent.push(m), 100);
      pad.release('gas', 9);
      expect(sent).toEqual([]);
    });
  });
});
