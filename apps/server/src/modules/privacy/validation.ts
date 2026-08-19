import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';

/** Same shape/behavior as `modules/media/validation.ts`'s `parseInput` — kept local so privacy
 * has no import from a sibling feature module for something this small (mirrors
 * `modules/tags/tag.service.ts`'s identical note). */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw AppError.validation(result.error.issues[0]?.message ?? 'invalid input.');
}

/** A `uint32` on the wire — `proto-loader` hands this through as a plain JS number, but never
 * trust it isn't a caller-forged negative/fractional value before it reaches a `jsonb`/integer
 * column. */
export const noticeVersionInputSchema = z
  .number()
  .int('notice_version must be a whole number.')
  .min(0, 'notice_version must not be negative.')
  .max(2 ** 31 - 1, 'notice_version is out of range.');
