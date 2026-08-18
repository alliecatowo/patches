import { MAX_POST_MEDIA } from '@patches/database';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';
import { safeUrlSchema } from '../../common/validation/url.js';

/**
 * Service-boundary validation for post inputs (spec §58, §103 — the same three-places rule
 * `modules/auth/validation.ts` documents: protobuf, service, database).
 */

export const POST_BODY_MAX_LENGTH = 5000;
/** Matches `packages/config`'s `PUBLIC_ORIGIN` pattern: `z.httpUrl()` rejects `localhost`,
 * which a self-hosted node's link posts must not (see LEARNINGS: zod-v4-url-validation). */
const LINK_URL_MAX_LENGTH = 2048;

const bodySchema = z
  .string()
  .trim()
  .max(
    POST_BODY_MAX_LENGTH,
    `post body must be at most ${String(POST_BODY_MAX_LENGTH)} characters`,
  );

/** §104 URL-scheme allowlist, shared with `modules/actors/validation.ts` via
 * `common/validation/url.ts`. */
const linkUrlSchema = safeUrlSchema(LINK_URL_MAX_LENGTH, 'link URL');

/** Same length budget as `body` (spec §58) — a content warning is a label, not a second post. */
const contentWarningSchema = z
  .string()
  .trim()
  .max(
    POST_BODY_MAX_LENGTH,
    `content warning must be at most ${String(POST_BODY_MAX_LENGTH)} characters`,
  );

export const uuidInputSchema = z.uuid('must be a valid id');

export const createPostInputSchema = z
  .object({
    clientRequestId: z.uuid('client_request_id must be a valid UUID (spec §45)'),
    body: bodySchema.optional(),
    linkUrl: linkUrlSchema.optional(),
    visibility: z.enum(['PUBLIC', 'UNLISTED', 'FOLLOWERS']),
    contentWarning: contentWarningSchema.optional(),
    inReplyToId: uuidInputSchema.optional(),
    mediaIds: z
      .array(uuidInputSchema)
      .max(MAX_POST_MEDIA, `a post may have at most ${String(MAX_POST_MEDIA)} images`),
  })
  .refine(
    (value) =>
      (value.body !== undefined && value.body.length > 0) ||
      value.linkUrl !== undefined ||
      value.mediaIds.length > 0,
    { message: 'a post needs text, a link, or at least one image (spec §23)' },
  );

export type CreatePostInput = z.infer<typeof createPostInputSchema>;

/** Same shape/behavior as `modules/auth/validation.ts`'s `parseInput` — kept local so posts
 * has no import from a sibling feature module for something this small. */
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
