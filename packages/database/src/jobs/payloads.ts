import { z } from 'zod';

/**
 * `OutboxJob.payload` is `jsonb` (untyped at the database layer), so every job type gets a
 * zod schema here that both the producer (whatever enqueues the job) and the consumer
 * (`apps/worker`'s handlers) parse against — the payload's shape is agreed in exactly one
 * place instead of drifting between the two sides of the queue.
 */

export const sendVerificationEmailPayloadSchema = z.object({
  userId: z.string().min(1),
  email: z.string().min(1),
  code: z.string().min(1),
});
export type SendVerificationEmailPayload = z.infer<typeof sendVerificationEmailPayloadSchema>;

export const sendPasswordResetEmailPayloadSchema = z.object({
  userId: z.string().min(1),
  email: z.string().min(1),
  code: z.string().min(1),
});
export type SendPasswordResetEmailPayload = z.infer<typeof sendPasswordResetEmailPayloadSchema>;

/**
 * `docs/architecture/jobs.md` §7: derives deterministic output keys from `mediaId`.
 * `expectedSha256` is the client-computed hash from `BeginMediaUploadRequest` — the worker
 * compares it against the SHA-256 it actually computes from the downloaded original and
 * fails validation (not the job) on a mismatch, per `media.proto`'s documented contract
 * ("verified against the uploaded object by the worker before the media is marked READY").
 * Optional: older enqueuers or a future proto revision might not send it, and its absence
 * just skips that particular check rather than blocking processing.
 */
export const processMediaPayloadSchema = z.object({
  mediaId: z.string().min(1),
  expectedSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'expectedSha256 must be 64 lowercase hex characters')
    .optional(),
});
export type ProcessMediaPayload = z.infer<typeof processMediaPayloadSchema>;

/** No input needed — the handler sweeps every expired row itself. */
export const cleanExpiredTokensPayloadSchema = z.object({}).strict();
export type CleanExpiredTokensPayload = z.infer<typeof cleanExpiredTokensPayloadSchema>;

export const cleanExpiredUploadsPayloadSchema = z.object({}).strict();
export type CleanExpiredUploadsPayload = z.infer<typeof cleanExpiredUploadsPayloadSchema>;

/**
 * `FEDERATION_DELIVER` (P8-004, `docs/architecture/federation.md`): deliver `activity` (an
 * already-built AS2 JSON document) to `inboxUrl`, signed as `actorId` (whichever local actor
 * owns this delivery — the follower for a `Follow`, the post's author for a `Create`/`Delete`,
 * the liker for a `Like`). `activityId` duplicates `activity.id` as a plain string so the
 * worker/dedupe logic never has to reach into the untyped `activity` blob to log or key on it.
 *
 * The enqueuer sets `OutboxJob.idempotencyKey` to `federation-deliver:${activityId}:
 * ${inboxUrl}` — the pair, not the activity alone, because one `Create` fans out to many
 * followers' inboxes and each `(activity, inbox)` delivery is its own durable unit of work
 * with its own retry/backoff state.
 */
export const federationDeliverPayloadSchema = z.object({
  activityId: z.string().min(1).max(2048),
  inboxUrl: z.string().min(1).max(2048),
  actorId: z.uuid(),
  activity: z.record(z.string(), z.unknown()),
});
export type FederationDeliverPayload = z.infer<typeof federationDeliverPayloadSchema>;
