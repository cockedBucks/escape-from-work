import { z } from 'zod';
import { parseConfig } from './parse';

const StatsSchema = z.strictObject({
  /** Multiplies top speed and acceleration. */
  speed: z.number().positive(),
  /** Multiplies sideways grip (cornering, drift control). */
  grip: z.number().positive(),
  /** Who wins bumps and how far items knock the car around. */
  weight: z.number().positive(),
});

/** Procedural horn sounds (the client synthesizes them; no audio files). */
export const HORNS = ['toot', 'duck', 'truck', 'clown', 'bike', 'kazoo'] as const;
export type Horn = (typeof HORNS)[number];

const CarDefSchema = z.strictObject({
  /** Stable id used in code, saves and the league (lowercase, digits, dashes). */
  id: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes'),
  /** Display name. */
  name: z.string().min(1),
  stats: StatsSchema,
  /** Horn preset (GAME_DESIGN §8: each car has its own goofy horn). */
  horn: z.enum(HORNS),
});

export const CarsSchema = z
  .strictObject({
    /** Balance limit: every stat of every car must sit inside this range (GAME_DESIGN §8). */
    statRange: z.strictObject({ min: z.number().positive(), max: z.number().positive() }),
    cars: z.array(CarDefSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const { min, max } = data.statRange;
    if (min > max) {
      ctx.addIssue({ code: 'custom', path: ['statRange'], message: 'min must be <= max' });
    }
    const seen = new Set<string>();
    data.cars.forEach((car, i) => {
      if (seen.has(car.id)) {
        ctx.addIssue({ code: 'custom', path: ['cars', i, 'id'], message: `duplicate id "${car.id}"` });
      }
      seen.add(car.id);
      for (const [stat, value] of Object.entries(car.stats)) {
        if (value < min || value > max) {
          ctx.addIssue({
            code: 'custom',
            path: ['cars', i, 'stats', stat],
            message: `${value} is outside the balance range ${min}–${max}`,
          });
        }
      }
    });
  });

export type CarsConfig = z.infer<typeof CarsSchema>;
export type CarDef = CarsConfig['cars'][number];

/** Validate the contents of `config/cars.json`. Throws `ConfigError` listing every problem. */
export function parseCars(raw: unknown, source = 'config/cars.json'): CarsConfig {
  return parseConfig(CarsSchema, raw, source);
}
