/**
 * Outbox job type constants (`docs/architecture/jobs.md` §9, `INITIAL_VISION.md` §12–13).
 * The single source of truth for `OutboxJob.type` string literals, shared by whichever
 * service enqueues a job (the server, today) and `apps/worker`, which claims and dispatches
 * them. Lives in `packages/database` — not `apps/worker` — because both sides of the queue
 * need to agree on the same literal strings without either depending on the other.
 */
export const JOB_TYPES = [
  'SEND_VERIFICATION_EMAIL',
  'SEND_PASSWORD_RESET_EMAIL',
  'PROCESS_MEDIA',
  'CLEAN_EXPIRED_TOKENS',
  'CLEAN_EXPIRED_UPLOADS',
  /** Phase 8 (`docs/architecture/federation.md`): sign-and-POST one ActivityPub activity to
   * one inbox URL. One job per `(activity, inbox)` pair — see `federationDeliverPayloadSchema`
   * for why that pair, not just the activity, is the idempotency unit. */
  'FEDERATION_DELIVER',
] as const;

export type JobType = (typeof JOB_TYPES)[number];
