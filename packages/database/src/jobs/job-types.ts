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
  /** P14-010 (`INITIAL_VISION.md` §197.3): builds one `account_exports` row's archive and
   * uploads it to object storage. Enqueued by `PrivacyService.ExportAccount` in the same
   * transaction as the `PENDING` row it fills in. */
  'EXPORT_ACCOUNT',
  /** P14-010 (`INITIAL_VISION.md` §197.4): purges an account once its grace period has
   * elapsed. Enqueued by `PrivacyService.RequestAccountDeletion` with `available_at` set to
   * the request's `purge_after` — the outbox's own delay mechanism doubles as the grace-period
   * timer, so no separate scheduler/cron is needed. Must stay idempotent: a redelivery after a
   * crash mid-purge, or a delivery that races a `CancelAccountDeletion`, both have to be
   * no-ops (`docs/architecture/jobs.md` §7). */
  'PURGE_ACCOUNT',
] as const;

export type JobType = (typeof JOB_TYPES)[number];
