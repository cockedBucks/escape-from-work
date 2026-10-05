import { describe, expect, it } from 'vitest';
import { roleText, swappedRole } from './roleKeys';

describe('role keys', () => {
  it('each role lists its own keys (Pilot steers, Engineer has pedals and nitro)', () => {
    expect(roleText('pilot').keys).toMatch(/A \/ D steer/);
    expect(roleText('pilot').keys).not.toMatch(/Shift/);
    expect(roleText('engineer').keys).toMatch(/Shift nitro/);
    expect(roleText('engineer').keys).not.toMatch(/A \/ D/);
    expect(roleText('solo').keys).toMatch(/Shift nitro/);
    expect(roleText('nonsense').title).toBe('WATCHING');
  });

  it('the swap lane trades Pilot and Engineer; solo stays solo', () => {
    expect(swappedRole('pilot')).toBe('engineer');
    expect(swappedRole('engineer')).toBe('pilot');
    expect(swappedRole('solo')).toBe('solo');
  });
});
