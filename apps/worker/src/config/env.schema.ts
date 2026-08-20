import { hostname } from 'node:os';

import { z } from 'zod';

import {
  baseEnvSchema,
  databaseEnvSchema,
  emailEnvSchema,
  emailEnvShape,
  loadEnv,
  storageEnvSchema,
} from '@patches/config';

export { ConfigError } from '@patches/config';
export type { ConfigIssue } from '@patches/config';

/**
 * Stable for the lifetime of the process — computed once at module load rather than per
 * `validateEnv()` call, since `hostname()`/`process.pid` never change while the worker runs.
 */
const DEFAULT_WORKER_ID = `${hostname()}-${String(process.pid)}`;

/**
 * Worker environment contract (`docs/architecture/jobs.md`, spec §12–13, §124), composed from
 * `@patches/config`'s shared schema pieces plus the claim-loop tuning unique to this app.
 *
 * `DATABASE_URL` is required unconditionally (unlike `apps/server`, which defers persistence
 * to Phase 1) — a worker with no database has nothing to claim. `emailEnvShape`'s
 * provider-specific requirements (`SMTP_HOST`/`SMTP_PORT` for `smtp`, `RESEND_API_KEY` for
 * `resend`) are re-validated in `superRefine` below by delegating to `emailEnvSchema` itself,
 * so the conditional logic lives in exactly one place (`packages/config`).
 */
const envObjectSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...emailEnvShape,
  ...storageEnvSchema.shape,

  /** Worker instance identifier, recorded in `outbox_jobs.locked_by`. */
  WORKER_ID: z.string().min(1).default(DEFAULT_WORKER_ID),
  /** Max jobs claimed per pass; also the effective concurrency (all claimed jobs run at once). */
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  /** Sleep interval when idle, and the starting point for idle backoff. */
  WORKER_POLL_MS: z.coerce.number().int().positive().default(1000),
  /** Ceiling for idle-poll backoff (`docs/architecture/jobs.md` §8: never a tight poll). */
  WORKER_IDLE_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(10_000),

  /**
   * B-013: how long a job may sit `PROCESSING` (via `locked_at`) before the stale-lease
   * sweep assumes the worker that claimed it crashed (not a graceful SIGTERM, which
   * releases nothing mid-handler by design — see `main.ts`) and resets it to `PENDING` for
   * reclaim. Must comfortably exceed the slowest legitimate handler's runtime; 10 minutes
   * is generous relative to the handlers registered so far (email sends, token cleanup,
   * media processing).
   */
  WORKER_LEASE_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 60_000),
  /** How often the claim loop checks for stale leases — a fraction of `WORKER_LEASE_TTL_MS`,
   * not every pass, since it's a table scan over `PROCESSING` rows. */
  WORKER_LEASE_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),

  /**
   * P8-004/P8-005: this node's own origin, needed by `FederationDeliverHandler` to build the
   * `keyId` (`${PUBLIC_ORIGIN}/users/{handle}#main-key`) it signs outgoing deliveries with —
   * must match the same node's `apps/server` `PUBLIC_ORIGIN` exactly, since that is the URI
   * the receiving peer dereferences to fetch the matching `publicKeyPem`. Same dev-friendly
   * default as the server's copy of this variable.
   */
  PUBLIC_ORIGIN: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),

  /**
   * B-026: same AES-256-GCM key as the federating `apps/server` node's copy of this variable
   * (`FederationDeliverHandler` decrypts `federation_keys.private_key_*` to sign outgoing
   * deliveries — see `packages/database/src/crypto/federation-key-cipher.ts`). Optional here
   * unconditionally, unlike the server's copy: this worker has no `FEDERATION_ENABLED` flag of
   * its own to gate the requirement on, and a worker that never claims a `FEDERATION_DELIVER`
   * job never needs it — an unset key only surfaces as an error if such a job is actually
   * claimed with no way to decrypt its signer's key.
   */
  FEDERATION_KEY_ENCRYPTION_KEY: z.string().trim().min(1).optional(),

  /**
   * S-002 (`OutboxCircuitBreaker`, `docs/operations/abuse-protection.md`): consecutive
   * failures of the *same job type* before its circuit opens — deliberately higher than a
   * single job's own `max_attempts` (`docs/architecture/jobs.md` §5–6), since one job
   * exhausting its own retries and dead-lettering is normal and must not, by itself, stop
   * every other pending job of that type from being tried.
   */
  WORKER_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
  /** How long a tripped circuit stays open before the next claim pass gets one half-open
   * trial job of that type. */
  WORKER_CIRCUIT_COOLDOWN_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60_000),
  /** S-002: `JobRunner` logs a `outbox_backlog` warning at most once per this interval when
   * the total `PENDING` row count exceeds `WORKER_BACKLOG_WARN_THRESHOLD` — observability for
   * the load-shedding this task is about, not itself a limit. */
  WORKER_BACKLOG_WARN_THRESHOLD: z.coerce.number().int().positive().default(1_000),
  WORKER_BACKLOG_LOG_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
});

export const envSchema = envObjectSchema.superRefine((value, ctx) => {
  const emailResult = emailEnvSchema.safeParse(value);
  if (!emailResult.success) {
    for (const issue of emailResult.error.issues) {
      ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate raw environment variables. Used both by `main.ts` (which needs config before
 * Nest exists) and by `ConfigModule.forRoot({ validate })`.
 *
 * Throws {@link ConfigError} (from `@patches/config`) listing every invalid variable — not
 * just the first — so a misconfigured deploy can be fixed in one pass.
 */
export function validateEnv(raw: Record<string, string | undefined>): Env {
  return loadEnv(envSchema, raw);
}
