import {
  ACCEPTED_MEDIA_CONTENT_TYPES,
  MAX_MEDIA_BYTES,
  isAcceptedMediaContentType,
} from '@patches/media';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';

export const uuidInputSchema = z.uuid('must be a valid id');

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** Same shape/behavior as `modules/auth/validation.ts`'s `parseInput` — kept local so media
 * has no import from a sibling feature module for something this small (mirrors
 * `modules/posts/validation.ts`'s identical note). */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw AppError.validation(result.error.issues[0]?.message ?? 'invalid input.');
}

/**
 * `BeginMediaUploadRequest` validation (spec §28, §58). Checked in this order — content type
 * before size — because a client that sent an unsupported type almost certainly wants that
 * error, not a "too large" one that happens to also be true. Distinct error codes
 * (`MEDIA_UNSUPPORTED_TYPE`/`MEDIA_TOO_LARGE`) rather than one generic `VALIDATION_ERROR`, so
 * a client can branch on which limit it hit.
 */
export function validateBeginMediaUploadInput(input: {
  mimeType: string;
  byteSize: number;
  sha256: string;
}): void {
  if (!isAcceptedMediaContentType(input.mimeType)) {
    throw new AppError(
      'MEDIA_UNSUPPORTED_TYPE',
      `mime_type must be one of: ${ACCEPTED_MEDIA_CONTENT_TYPES.join(', ')}.`,
    );
  }
  if (
    !Number.isInteger(input.byteSize) ||
    input.byteSize <= 0 ||
    input.byteSize > MAX_MEDIA_BYTES
  ) {
    throw new AppError(
      'MEDIA_TOO_LARGE',
      `byte_size must be between 1 and ${String(MAX_MEDIA_BYTES)} bytes.`,
    );
  }
  if (!SHA256_HEX_PATTERN.test(input.sha256)) {
    throw AppError.validation('sha256 must be 64 lowercase hex characters.');
  }
}

/** Parses `byte_size` from the wire's `uint64`-as-`string` form (ts-proto convention for
 * 64-bit fields — same reasoning as `Media.byteSize`, see `docs/research/typeorm-postgres.md`
 * §7) into a `number`, safe because `MAX_MEDIA_BYTES` is nowhere near
 * `Number.MAX_SAFE_INTEGER`. Rejects anything that doesn't round-trip cleanly (non-numeric,
 * fractional, or actually too large to be a safe integer) rather than silently truncating. */
export function parseByteSize(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw AppError.validation('byte_size must be a non-negative integer.');
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw AppError.validation('byte_size is out of range.');
  }
  return parsed;
}
