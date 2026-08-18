import {
  GUESTBOOK_ENTRY_MAX_CHARS,
  PAGE_SLUG_MAX_CHARS,
  PAGE_SLUG_PATTERN,
  sanitizeText,
} from '@patches/domain';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Service-boundary validation for `PageService` inputs that aren't already covered by
 * `@patches/domain`'s document/block schemas (spec §58, §103) — request-level fields like
 * `slug`, `entry_id`, and the guestbook `body`, which the wire carries outside the document
 * bytes `UpdatePage` validates.
 */

export const uuidInputSchema = z.uuid('must be a valid id');

const slugShapeSchema = z
  .string()
  .max(PAGE_SLUG_MAX_CHARS)
  .regex(PAGE_SLUG_PATTERN, 'slug must be lowercase letters, digits, and hyphens');

/** Empty means "index" (matches `GetPageRequest.slug`'s doc comment). Every RPC that takes a
 * `slug` normalizes through this — see `pages.service.ts`'s class doc for why a slug doesn't
 * currently select a distinct guestbook. */
export function normalizeSlug(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return 'index';

  const result = slugShapeSchema.safeParse(trimmed);
  if (!result.success) {
    throw AppError.validation('slug must be lowercase letters, digits, and hyphens');
  }
  return result.data;
}

/** Sanitized (control characters/escape sequences stripped, §172) and bounded to
 * `GUESTBOOK_ENTRY_MAX_CHARS` (§171). Multiline is preserved — a guestbook entry is a short
 * message, not a single-line label like a title. */
export function normalizeGuestbookBody(raw: string): string {
  const sanitized = sanitizeText(raw, { multiline: true }).trim();
  if (sanitized.length === 0) {
    throw AppError.validation('Guestbook entries cannot be empty.');
  }
  if (sanitized.length > GUESTBOOK_ENTRY_MAX_CHARS) {
    throw AppError.validation(
      `Guestbook entries must be at most ${String(GUESTBOOK_ENTRY_MAX_CHARS)} characters.`,
    );
  }
  return sanitized;
}

/** Same shape/behavior as `modules/posts/validation.ts`'s `parseInput` — kept local rather
 * than a cross-module import for the same reason documented there. */
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
