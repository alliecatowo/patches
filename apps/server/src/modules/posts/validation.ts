import { MAX_POST_MEDIA } from '@patches/database';
import { MAX_POST_CHARS_NODE_CEILING } from '@patches/domain';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';
import { safeUrlSchema } from '../../common/validation/url.js';

/**
 * Service-boundary validation for post inputs (spec §58, §103 — the same three-places rule
 * `modules/auth/validation.ts` documents: protobuf, service, database).
 */

/** Structural ceiling only — the absolute maximum any node may ever configure
 * `MAX_POST_CHARS` up to (spec §186.2, `@patches/domain`'s `MAX_POST_CHARS_NODE_CEILING`).
 * The *actual*, node-configured limit (5,000 default, up to this ceiling) is enforced
 * dynamically in `PostService` against `AppConfigService.maxPostChars` — a static zod
 * `.max()` can't read config, so this schema only rejects what no node could ever accept. */
export const POST_BODY_MAX_LENGTH = MAX_POST_CHARS_NODE_CEILING;
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

export const quotePolicyInputSchema = z.enum(['ANYONE', 'FOLLOWERS', 'NOBODY']);

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
    /** Empty unless this post quotes another (spec §180.2, §189). */
    quotedPostId: uuidInputSchema.optional(),
    /** Empty unless this post is being created into a community; immutable after insert
     * (spec §189) — there is no edit path for it. */
    communityId: uuidInputSchema.optional(),
    /** Defaults to `ANYONE` (spec §180.2) — an unset/`UNSPECIFIED` request value maps here
     * before this schema ever sees it (`post.mapper.ts`'s `quotePolicyFromProto`). */
    quotePolicy: quotePolicyInputSchema,
  })
  .refine(
    (value) =>
      (value.body !== undefined && value.body.length > 0) ||
      value.linkUrl !== undefined ||
      value.mediaIds.length > 0,
    { message: 'a post needs text, a link, or at least one image (spec §23)' },
  )
  .refine(
    (value) =>
      value.quotedPostId === undefined ||
      (value.body !== undefined && value.body.length > 0) ||
      value.mediaIds.length > 0,
    {
      message:
        'a quote must carry a body or media of its own — an empty quote is a repost (spec §180.2)',
      path: ['quotedPostId'],
    },
  );

export type CreatePostInput = z.infer<typeof createPostInputSchema>;

/** `EditPost` has no field mask (spec §189's `EditPostRequest`) — every call resends the full
 * replacement `body`/`content_warning`/`media_ids`, same "full replace, no partial merge"
 * shape as the wire message. An empty `body` is valid when media/a link carries the post. */
export const editPostInputSchema = z.object({
  body: bodySchema,
  contentWarning: contentWarningSchema,
  mediaIds: z
    .array(uuidInputSchema)
    .max(MAX_POST_MEDIA, `a post may have at most ${String(MAX_POST_MEDIA)} images`),
});

export type EditPostInput = z.infer<typeof editPostInputSchema>;

/** `SearchPosts` (spec §194 — no relevance ranking, keyset-paged like every other list RPC).
 * `query` rejects empty/whitespace-only and is capped well below any Postgres
 * `websearch_to_tsquery` practical limit; `authorHandle` reuses the same 3-30 char shape
 * `MENTION_PATTERN` in `post.service.ts` matches, since it is looked up the same
 * case-insensitive way. */
export const SEARCH_QUERY_MAX_LENGTH = 200;

export const searchPostsInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, 'query must not be empty')
    .max(
      SEARCH_QUERY_MAX_LENGTH,
      `query must be at most ${String(SEARCH_QUERY_MAX_LENGTH)} characters`,
    ),
  authorHandle: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,30}$/, 'author_handle must be a valid handle')
    .optional(),
});

export type SearchPostsInput = z.infer<typeof searchPostsInputSchema>;

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
