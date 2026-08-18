import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';
import { safeUrlSchema } from '../../common/validation/url.js';

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
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** Serialized-JSON byte budget for `actors.nameplate` (spec §173). */
export const NAMEPLATE_MAX_BYTES = 2048;
const NAME_COLOR_MAX_LENGTH = 32;
const GLYPH_MAX_LENGTH = 8;
const STATUS_LINE_MAX_LENGTH = LOCATION_TEXT_MAX_LENGTH;
const AVATAR_FRAME_MAX_LENGTH = 64;
const PROFILE_BORDER_MAX_LENGTH = 64;

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

/** §104 URL-scheme allowlist (http(s) only, no embedded credentials), shared with
 * `modules/posts/validation.ts` via `common/validation/url.ts`. An empty string (field
 * cleared) is allowed through separately by the caller, not by this schema. */
export const websiteUrlSchema = safeUrlSchema(WEBSITE_URL_MAX_LENGTH, 'website URL');

export const uuidInputSchema = z.uuid('must be a valid id');

export const searchQuerySchema = z
  .string()
  .trim()
  .min(1, 'query is required')
  .max(
    SEARCH_QUERY_MAX_LENGTH,
    `search query must be at most ${String(SEARCH_QUERY_MAX_LENGTH)} characters`,
  );

/** `ResolveActor` (B-028): `user@domain`, no leading `acct:` (the proto field doc explains
 * why). Matches WebFinger's `acct` grammar loosely — a bare "no `@`, or more than one `@`"
 * shape check, not a full RFC 7565 validator; `RemoteActorService`/the remote WebFinger
 * responder are what actually reject a nonexistent handle. */
export const acctSchema = z
  .string()
  .trim()
  .min(3, 'acct must be in the form user@domain')
  .max(320, 'acct is too long')
  .regex(/^[^@\s]+@[^@\s]+$/, 'acct must be in the form user@domain');

/**
 * Client-writable nameplate fields (spec §173). `badges` is deliberately absent from this
 * schema — it is server-attested only, and `ActorService.updateProfile` never reads a client-
 * supplied value for it (see the caller).
 */
export const nameplateInputSchema = z.object({
  nameColor: z.string().trim().max(NAME_COLOR_MAX_LENGTH).optional(),
  glyph: z.string().trim().max(GLYPH_MAX_LENGTH).optional(),
  avatarFrame: z.string().trim().max(AVATAR_FRAME_MAX_LENGTH).optional(),
  statusLine: z.string().trim().max(STATUS_LINE_MAX_LENGTH).optional(),
  profileBorder: z.string().trim().max(PROFILE_BORDER_MAX_LENGTH).optional(),
});
export type NameplateInput = z.infer<typeof nameplateInputSchema>;

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
