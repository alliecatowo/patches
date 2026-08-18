import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Service-boundary validation for actor profile inputs (spec §58, §103). Limits mirror
 * `docs/architecture/api.md` §8 and `modules/auth/validation.ts`'s `DISPLAY_NAME_MAX_LENGTH`
 * (kept as a separate constant here rather than imported — a rename of the auth-registration
 * limit should not silently also change the profile-editing limit).
 */

export const DISPLAY_NAME_MAX_LENGTH = 80;
export const BIO_MAX_LENGTH = 500;
export const LOCATION_TEXT_MAX_LENGTH = 100;
export const WEBSITE_URL_MAX_LENGTH = 2048;

export const displayNameSchema = z
  .string()
  .trim()
  .max(
    DISPLAY_NAME_MAX_LENGTH,
    `display name must be at most ${String(DISPLAY_NAME_MAX_LENGTH)} characters`,
  );

export const bioSchema = z
  .string()
  .trim()
  .max(BIO_MAX_LENGTH, `bio must be at most ${String(BIO_MAX_LENGTH)} characters`);

export const locationTextSchema = z
  .string()
  .trim()
  .max(
    LOCATION_TEXT_MAX_LENGTH,
    `location must be at most ${String(LOCATION_TEXT_MAX_LENGTH)} characters`,
  );

/** `z.url({ protocol: /^https?$/ })`, not `z.httpUrl()` — see LEARNINGS: zod-v4-url-validation
 * (`z.httpUrl()` rejects a self-hosted node's `localhost` links). An empty string (field
 * cleared) is allowed through separately by the caller, not by this schema. */
export const websiteUrlSchema = z
  .string()
  .trim()
  .max(
    WEBSITE_URL_MAX_LENGTH,
    `website URL must be at most ${String(WEBSITE_URL_MAX_LENGTH)} characters`,
  )
  .pipe(z.url({ protocol: /^https?$/, error: 'website URL must be a valid http(s) URL' }));

export const uuidInputSchema = z.uuid('must be a valid id');

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
