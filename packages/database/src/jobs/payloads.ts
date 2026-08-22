import { z } from 'zod';

/**
 * `OutboxJob.payload` is `jsonb` (untyped at the database layer), so every job type gets a
 * zod schema here that both the producer (whatever enqueues the job) and the consumer
 * (`apps/worker`'s handlers) parse against — the payload's shape is agreed in exactly one
 * place instead of drifting between the two sides of the queue.
 */

const canonicalBase64Schema = z
  .string()
  .min(1)
  .refine((value) => {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length > 0 && decoded.toString('base64') === value;
  }, 'must be canonical base64');

export const authCodeDeliveryKeyIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]{1,64}$/, 'must be a 1-64 character delivery key id');

export const authCodeDeliveryKeyringSchema = z.record(
  authCodeDeliveryKeyIdSchema,
  canonicalBase64Schema.refine(
    (value) => Buffer.from(value, 'base64').length === 32,
    'must decode to exactly 32 bytes',
  ),
);
export type AuthCodeDeliveryKeyring = z.infer<typeof authCodeDeliveryKeyringSchema>;

export const authCodeDeliveryKeyringJsonSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, ctx): AuthCodeDeliveryKeyring => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be a JSON object of delivery keys' });
      return z.NEVER;
    }
    const parsedKeyring = authCodeDeliveryKeyringSchema.safeParse(parsedJson);
    if (!parsedKeyring.success) {
      // Deliberately collapse inner paths: a key id is operational secret metadata and must
      // not be copied into a boot error or deployment log.
      ctx.addIssue({ code: 'custom', message: 'must contain only valid 32-byte delivery keys' });
      return z.NEVER;
    }
    return parsedKeyring.data;
  });

export const authCodeDeliveryEnvelopeSchema = z
  .object({
    v: z.literal(1),
    kid: authCodeDeliveryKeyIdSchema,
    authCodeId: z.uuid(),
    iv: canonicalBase64Schema.refine(
      (value) => Buffer.from(value, 'base64').length === 12,
      'iv must decode to exactly 12 bytes',
    ),
    ciphertext: canonicalBase64Schema,
    tag: canonicalBase64Schema.refine(
      (value) => Buffer.from(value, 'base64').length === 16,
      'tag must decode to exactly 16 bytes',
    ),
  })
  .strict();
export type AuthCodeDeliveryEnvelope = z.infer<typeof authCodeDeliveryEnvelopeSchema>;

export const authCodeDeliveryTombstoneSchema = z
  .object({ v: z.literal(1), redacted: z.literal(true) })
  .strict();
export const AUTH_CODE_DELIVERY_TOMBSTONE = { v: 1, redacted: true } as const;

export const sendVerificationEmailPayloadSchema = authCodeDeliveryEnvelopeSchema;
export type SendVerificationEmailPayload = z.infer<typeof sendVerificationEmailPayloadSchema>;

export const sendPasswordResetEmailPayloadSchema = authCodeDeliveryEnvelopeSchema;
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

/**
 * `EXPORT_ACCOUNT` (P14-010, `INITIAL_VISION.md` §197.3): `exportId` names the
 * `account_exports` row to fill in; `actorId` is whose data to collect. Both travel on the
 * payload (rather than the handler re-deriving `actorId` from the row) so the handler can
 * still log/report which actor a stale/missing row belonged to.
 */
export const exportAccountPayloadSchema = z.object({
  exportId: z.uuid(),
  actorId: z.uuid(),
});
export type ExportAccountPayload = z.infer<typeof exportAccountPayloadSchema>;

/**
 * `PURGE_ACCOUNT` (P14-010, `INITIAL_VISION.md` §197.4). Just `actorId`: unlike
 * `EXPORT_ACCOUNT`, the durable record of *why* this job exists is the
 * `account_deletion_requests` row itself (keyed by `actorId`), not the payload — the handler
 * re-reads that row at execution time specifically so a `CancelAccountDeletion` that lands
 * after this job was enqueued (but before it runs) is honored.
 */
export const purgeAccountPayloadSchema = z.object({
  actorId: z.uuid(),
});
export type PurgeAccountPayload = z.infer<typeof purgeAccountPayloadSchema>;

/** No input needed — the handler reads `e2ee_node_franking_keys` itself and reschedules its own
 * next run (`docs/operations/e2ee-franking-key-rotation.md`). */
export const rotateE2eeFrankingKeyPayloadSchema = z.object({}).strict();
export type RotateE2eeFrankingKeyPayload = z.infer<typeof rotateE2eeFrankingKeyPayloadSchema>;
