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

/** `docs/architecture/jobs.md` §7: derives deterministic output keys from `mediaId`. */
export const processMediaPayloadSchema = z.object({
  mediaId: z.string().min(1),
});
export type ProcessMediaPayload = z.infer<typeof processMediaPayloadSchema>;

/** No input needed — the handler sweeps every expired row itself. */
export const cleanExpiredTokensPayloadSchema = z.object({}).strict();
export type CleanExpiredTokensPayload = z.infer<typeof cleanExpiredTokensPayloadSchema>;

export const cleanExpiredUploadsPayloadSchema = z.object({}).strict();
export type CleanExpiredUploadsPayload = z.infer<typeof cleanExpiredUploadsPayloadSchema>;
