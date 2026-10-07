import type { BodyPreset, CarDef } from '@escape/shared';
import { t, type StringKey } from '../i18n';

// The real-life car type shown under a car's pun name (P12.2): "Cabbie · Sedan".

const TYPE_KEYS: Readonly<Record<BodyPreset, StringKey>> = {
  hatchback: 'carType.hatchback',
  sedan: 'carType.sedan',
  pickup: 'carType.pickup',
  muscle: 'carType.muscle',
  suv: 'carType.suv',
  city: 'carType.city',
  sports: 'carType.sports',
  van: 'carType.van',
};

/** "Hatchback", "Pickup truck", … in the current language. */
export function carType(body: BodyPreset): string {
  return t(TYPE_KEYS[body]);
}

/** "Spoiler Alert · Hatchback". */
export function carLabel(car: Pick<CarDef, 'name' | 'look'>): string {
  return `${car.name} · ${carType(car.look.body)}`;
}
