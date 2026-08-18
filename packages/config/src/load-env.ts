import type { z } from 'zod';
import { ConfigError } from './errors.js';

/**
 * Parses `source` (defaults to `process.env`) against `schema` and returns the typed,
 * coerced result. Throws {@link ConfigError} listing every invalid variable — not just the
 * first — if validation fails. Never a required dependency of any particular schema shape;
 * pass any zod schema built from the pieces in `./schemas`.
 */
export function loadEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: Record<string, string | undefined> = process.env,
): z.infer<Schema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)',
      message: issue.message,
    }));
    throw new ConfigError(issues);
  }
  return result.data;
}
