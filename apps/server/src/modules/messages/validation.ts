import { DM_GROUP_MAX, MAX_DM_BODY_CHARS, sanitizeText } from '@patches/domain';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Service-boundary validation for `DirectMessageService` inputs (spec §58, §103, §188 — the
 * same three-places rule `modules/posts/validation.ts` documents: protobuf, service,
 * database).
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

/** §183.3's body limit, applied after `sanitizeText` strips control bytes/ANSI escapes/bidi
 * overrides (spec §172, §192) — multiline is preserved, a DM is not a single-line label. */
export function normalizeMessageBody(raw: string): string {
  const sanitized = sanitizeText(raw, { multiline: true }).trim();
  if (sanitized.length === 0) {
    throw AppError.validation('Message body cannot be empty.');
  }
  if (sanitized.length > MAX_DM_BODY_CHARS) {
    throw AppError.validation(
      `Message body must be at most ${String(MAX_DM_BODY_CHARS)} characters.`,
    );
  }
  return sanitized;
}

export const sendMessageInputSchema = z.object({
  clientRequestId: z.uuid('client_request_id must be a valid UUID (spec §45)'),
  conversationId: uuidInputSchema,
  body: z.string(),
});

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

/** `recipient_actor_ids` excludes the caller (spec §189's doc on the request message) — 1
 * recipient makes a direct conversation, 2 to `DM_GROUP_MAX - 1` makes a group. The caller
 * itself fills the last group seat, hence `DM_GROUP_MAX - 1` here. */
export const createConversationInputSchema = z.object({
  clientRequestId: z.uuid('client_request_id must be a valid UUID (spec §45)'),
  recipientActorIds: z
    .array(uuidInputSchema)
    .min(1, 'a conversation needs at least one recipient')
    .max(
      DM_GROUP_MAX - 1,
      `a conversation may have at most ${String(DM_GROUP_MAX)} members including you`,
    ),
  initialBody: z.string(),
});

export type CreateConversationInput = z.infer<typeof createConversationInputSchema>;
