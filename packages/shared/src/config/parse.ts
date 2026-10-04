import { prettifyError, type ZodType } from 'zod';

/** Thrown when a config file does not match its schema. The message lists every problem. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/**
 * Validate already-parsed JSON against a schema. Shared code never touches the file system:
 * the caller (server, script, test) reads the file and passes its contents here.
 */
export function parseConfig<T>(schema: ZodType<T>, raw: unknown, source: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(`Invalid config in ${source}:\n${prettifyError(result.error)}`);
  }
  return result.data;
}
