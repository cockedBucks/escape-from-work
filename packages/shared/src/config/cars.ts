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
export const HORNS = ['toot', 'duck', 'truck', 'clown', 'bike', 'kazoo', 'siren', 'squeak'] as const;
export type Horn = (typeof HORNS)[number];

/** Car kit body presets (ART_STYLE §4); the client has their proportions. */
export const BODY_PRESETS = ['hatch', 'sedan', 'pickup', 'van', 'mini', 'round', 'muscle'] as const;
export type BodyPreset = (typeof BODY_PRESETS)[number];

/** Car kit parts: each car's signature feature(s) (ART_STYLE car roster). */
export const CAR_PARTS = ['spoiler', 'roofSign', 'speakers', 'hoodScoop', 'roofBox', 'windupKey', 'dish', 'ladder'] as const;
export type CarPart = (typeof CAR_PARTS)[number];

/** How a car looks: body preset, wheel size (1 = normal; ART_STYLE wants them big) and parts. */
const LookSchema = z.strictObject({
  body: z.enum(BODY_PRESETS),
  wheelScale: z.number().min(0.6).max(1.8),
  parts: z.array(z.enum(CAR_PARTS)),
});

const CarDefSchema = z.strictObject({
  /** Stable id used in code, saves and the league (lowercase, digits, dashes). */
  id: z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, digits and dashes'),
  /** Display name. */
  name: z.string().min(1),
  stats: StatsSchema,
  /** Horn preset (GAME_DESIGN §8: each car has its own goofy horn). */
  horn: z.enum(HORNS),
  look: LookSchema,
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
export type CarLook = CarDef['look'];

/** Validate the contents of `config/cars.json`. Throws `ConfigError` listing every problem. */
export function parseCars(raw: unknown, source = 'config/cars.json'): CarsConfig {
  return parseConfig(CarsSchema, raw, source);
}
