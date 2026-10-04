import { z } from 'zod';
import { TuningSchema, type Tuning } from './tuning';

/** One editable number in tuning.json, with the limits its schema allows. */
export interface TuningField {
  /** e.g. ['car', 'topSpeed'] */
  path: string[];
  min?: number;
  max?: number;
  /** Lower limit is exclusive (must be > min, not >= min). */
  minExclusive: boolean;
  integer: boolean;
}

interface JsonSchemaNode {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
}

/**
 * Every numeric leaf of the tuning schema, in file order, with min/max from the schema.
 * The F2 panel builds its sliders from this list, so new keys show up by themselves.
 */
export function tuningFields(): TuningField[] {
  const root = z.toJSONSchema(TuningSchema) as JsonSchemaNode;
  const out: TuningField[] = [];
  const walk = (node: JsonSchemaNode, path: string[]): void => {
    if (node.type === 'object' && node.properties) {
      for (const [key, child] of Object.entries(node.properties)) walk(child, [...path, key]);
      return;
    }
    if (node.type !== 'number' && node.type !== 'integer') return;
    const field: TuningField = { path, minExclusive: node.exclusiveMinimum !== undefined, integer: node.type === 'integer' };
    const min = node.minimum ?? node.exclusiveMinimum;
    if (min !== undefined) field.min = min;
    if (node.maximum !== undefined) field.max = node.maximum;
    out.push(field);
  };
  walk(root, []);
  return out;
}

/** Read a value by path (undefined if the path does not exist). */
export function getTuningValue(t: Tuning, path: readonly string[]): unknown {
  let cur: unknown = t;
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}
