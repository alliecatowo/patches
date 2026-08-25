import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Service-boundary validation for `DirectMessageService` inputs (spec §58, §103 — the same
 * three-places rule `modules/posts/validation.ts` documents: protobuf, service, database). Only
 * the generic conversation surface's inputs remain here (ADR 0030 §B-095) — the message-body
 * and group-size validation this file used to carry moved with the plaintext send/create RPCs
 * to `E2eeService`, which validates its own inputs.
 */

export const uuidInputSchema = z.uuid('must be a valid id');

/** Same shape/behavior as `modules/posts/validation.ts`'s `parseInput` — kept local so
 * `messages` has no import from a sibling feature module for something this small. */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path.length === 0 ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');
  throw AppError.validation(details.length === 0 ? 'Invalid request.' : details);
}
