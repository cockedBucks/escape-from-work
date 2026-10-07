import { describe, expect, it } from 'vitest';
import { showroomIndex } from '../render/showroom';
import { SHOWROOM } from '../render/look';
import { captionOf, cycleIndex, loadingMessages } from './mainMenu';

describe('main menu', () => {
  it('cycles through items, one period each, and wraps', () => {
    expect(cycleIndex(0, 1000, 3)).toBe(0);
    expect(cycleIndex(999, 1000, 3)).toBe(0);
    expect(cycleIndex(1000, 1000, 3)).toBe(1);
    expect(cycleIndex(3500, 1000, 3)).toBe(0);
    expect(cycleIndex(5000, 1000, 0)).toBe(0);
  });

  it('turns file names into captions', () => {
    expect(captionOf('office-party_2025.jpg')).toBe('office party 2025');
    expect(captionOf('مكتب جديد.png')).toBe('مكتب جديد');
  });

  it('has plenty of loading jokes, all ending in an ellipsis', () => {
    expect(loadingMessages().length).toBeGreaterThanOrEqual(10);
    for (const m of loadingMessages()) expect(m.endsWith('…')).toBe(true);
  });

  it('shows each roster car on the turntable in turn', () => {
    expect(showroomIndex(0, 8)).toBe(0);
    expect(showroomIndex(SHOWROOM.carSeconds * 1.5, 8)).toBe(1);
    expect(showroomIndex(SHOWROOM.carSeconds * 8, 8)).toBe(0);
  });
});
