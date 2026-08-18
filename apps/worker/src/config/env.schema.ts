import { hostname } from 'node:os';

import { z } from 'zod';

import {
  baseEnvSchema,
  databaseEnvSchema,
  emailEnvSchema,
  emailEnvShape,
  loadEnv,
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

  /** Worker instance identifier, recorded in `outbox_jobs.locked_by`. */
  WORKER_ID: z.string().min(1).default(DEFAULT_WORKER_ID),
  /** Max jobs claimed per pass; also the effective concurrency (all claimed jobs run at once). */
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  /** Sleep interval when idle, and the starting point for idle backoff. */
  WORKER_POLL_MS: z.coerce.number().int().positive().default(1000),
  /** Ceiling for idle-poll backoff (`docs/architecture/jobs.md` §8: never a tight poll). */
  WORKER_IDLE_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(10_000),
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
