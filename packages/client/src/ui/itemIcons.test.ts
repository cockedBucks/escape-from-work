import { ITEM_IDS } from '@escape/shared';
import { describe, expect, it } from 'vitest';
import { gaugeText } from './gauges';
import { itemIcon } from './itemIcons';
import { ITEM_NAMES } from './items';

describe('item icons and names', () => {
  it('every item has an inline SVG icon and a name; unknown ids have none', () => {
    for (const id of ITEM_IDS) {
      expect(itemIcon(id)).toMatch(/^<svg class="item-icon"/);
      expect(ITEM_NAMES[id].length).toBeGreaterThan(2);
    }
    expect(itemIcon('')).toBe('');
  });

  it('the gauges show the held item by name', () => {
    const v = { speed: 0, lap: null, place: null, heat: null, stalled: false, nitro: null };
    expect(gaugeText({ ...v, item: 'coffeeSpill' }).item).toBe('Coffee Spill');
    expect(gaugeText({ ...v, item: null }).item).toBe('—');
  });
});
