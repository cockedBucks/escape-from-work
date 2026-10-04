import { describe, expect, it } from 'vitest';
import { parseScenario } from './test-hooks';

describe('parseScenario', () => {
  it('reads scenario and seed', () => {
    expect(parseScenario('?scenario=hello&seed=7')).toEqual({ scenario: 'hello', seed: 7 });
  });

  it('no scenario and seed 1 by default', () => {
    expect(parseScenario('')).toEqual({ scenario: null, seed: 1 });
    expect(parseScenario('?scenario=&seed=abc')).toEqual({ scenario: null, seed: 1 });
  });
});
