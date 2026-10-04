import { describe, expect, it } from 'vitest';
import realCars from '../../../../config/cars.json';
import { parseCars } from './cars';

function copy(): { statRange: { min: number; max: number }; cars: Record<string, unknown>[] } {
  return JSON.parse(JSON.stringify(realCars)) as ReturnType<typeof copy>;
}

const msgOf = (raw: unknown): string => {
  try {
    parseCars(raw);
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected parseCars to throw');
};

describe('cars config', () => {
  it('accepts the real config/cars.json', () => {
    const cfg = parseCars(realCars);
    expect(cfg.cars.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects a stat outside the balance range and names it', () => {
    const raw = copy();
    raw.cars[0]!['stats'] = { speed: 1.2, grip: 1, weight: 1 };
    const msg = msgOf(raw);
    expect(msg).toContain('cars[0].stats.speed');
    expect(msg).toContain('balance range');
  });

  it('rejects duplicate ids', () => {
    const raw = copy();
    raw.cars.push(JSON.parse(JSON.stringify(raw.cars[0])) as Record<string, unknown>);
    expect(msgOf(raw)).toContain('duplicate id');
  });

  it('rejects a bad id, an empty roster and an upside-down range', () => {
    const raw = copy();
    raw.cars[0]!['id'] = 'Box Car';
    expect(msgOf(raw)).toContain('cars[0].id');
    expect(msgOf({ ...copy(), cars: [] })).toContain('cars');
    expect(msgOf({ ...copy(), statRange: { min: 1.1, max: 0.9 } })).toContain('statRange');
  });
});
