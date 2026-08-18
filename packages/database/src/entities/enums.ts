/**
 * Enum-ish column values. Stored as `text` with a named `CHECK` constraint rather than a
 * native PostgreSQL `enum` type: adding or renaming a value on a native enum needs
 * `ALTER TYPE ... ADD VALUE` (which cannot run inside a transaction block in older PG and
 * can't remove values at all), whereas a CHECK constraint is a plain
 * drop-and-recreate in a migration. Recommended by `docs/research/typeorm-postgres.md` §7.
 *
 * Each list is the single source of truth for both the TS union type and the SQL CHECK
 * expression (via `checkIn`), so the two can never drift.
 */

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const POST_TYPES = ['NOTE', 'LINK'] as const;
export type PostType = (typeof POST_TYPES)[number];

export const POST_VISIBILITIES = ['PUBLIC', 'UNLISTED', 'FOLLOWERS'] as const;
export type PostVisibility = (typeof POST_VISIBILITIES)[number];

export const MEDIA_STATES = ['PENDING_UPLOAD', 'PROCESSING', 'READY', 'FAILED', 'DELETED'] as const;
export type MediaState = (typeof MEDIA_STATES)[number];

/**
 * How a user proves who they are (`INITIAL_VISION.md` §162+, ADR 0011). Identity is the
 * account; a password is just one credential among several, and email is only a recovery
 * channel.
 */
export const CREDENTIAL_TYPES = ['PASSWORD', 'SSH_PUBLIC_KEY', 'GITHUB', 'PASSKEY'] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export const AUTH_CODE_PURPOSES = ['VERIFY_EMAIL', 'RESET_PASSWORD'] as const;
export type AuthCodePurpose = (typeof AUTH_CODE_PURPOSES)[number];

/**
 * Job lifecycle (`docs/architecture/jobs.md` §2): claimable rows are `PENDING`, a worker
 * flips them to `PROCESSING` while it holds them, then `COMPLETED`, back to `PENDING` with
 * a later `available_at` on a retryable failure, or `DEAD` once `attempts >= max_attempts`.
 * `FAILED` is the terminal-but-not-retryable state for a job a handler rejects outright.
 */
export const OUTBOX_JOB_STATUSES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'DEAD',
] as const;
export type OutboxJobStatus = (typeof OUTBOX_JOB_STATUSES)[number];

/**
 * Builds `"column" IN ('A', 'B')` for a `@Check(...)` expression from a value list, so the
 * TS union and the database constraint are generated from the same array. Values are
 * compile-time string literals from this module only — never user input — so the simple
 * quoting here is safe.
 */
export function checkIn(columnName: string, values: readonly string[]): string {
  return `"${columnName}" IN (${values.map((value) => `'${value}'`).join(', ')})`;
}
