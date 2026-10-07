import { describe, expect, it } from 'vitest';
import { hintText, parseSeen } from './onboarding';

describe('first-time hints', () => {
  it('remembers the hints already seen, ignoring junk', () => {
    expect([...parseSeen(null)]).toEqual([]);
    expect([...parseSeen('not json')]).toEqual([]);
    expect([...parseSeen(JSON.stringify(['swap', 'bogus', 7, 'item']))].sort()).toEqual(['item', 'swap']);
  });

  it('the hints name the keys they teach', () => {
    expect(hintText('item')).toContain('Space');
    expect(hintText('item')).toContain('Q');
    expect(hintText('swap')).toContain('SWAP');
  });
});
