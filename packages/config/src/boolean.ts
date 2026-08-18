import { z } from 'zod';

const TRUE_VALUES = new Set(['true', '1']);
const FALSE_VALUES = new Set(['false', '0']);

/**
 * A boolean schema that also accepts the string shapes environment variables actually
 * arrive in: "true"/"false"/"1"/"0" (case-insensitive, surrounding whitespace trimmed).
 * A real boolean passes through unchanged (useful when the source isn't `process.env`,
 * e.g. in tests that build a config object directly).
 */
export function booleanish(): z.ZodType<boolean, boolean | string> {
  return z.union([z.boolean(), z.string()]).transform((value, ctx) => {
    if (typeof value === 'boolean') return value;
    const normalized = value.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
    ctx.addIssue({
      code: 'custom',
      message: 'Expected a boolean-ish value: "true", "false", "1", or "0"',
    });
    return z.NEVER;
  });
}
