import { AppError } from '../errors/app-error.js';
import type { DbRateLimitStore } from '../../modules/auth/db-rate-limit-store.service.js';

/**
 * A thin, action-agnostic wrapper over `DbRateLimitStore` (`modules/auth/db-rate-limit-
 * store.service.ts`) for the Amendment B write paths that need a database-backed, per-actor
 * fixed window (spec §102, §188: "database-backed for the abuse-sensitive ones") without
 * joining `modules/auth/rate-limit.service.ts`'s closed `RateLimitAction` union — that union
 * is auth's own vocabulary; `DbRateLimitStore.increment` itself is a generic `(key, windowMs)`
 * counter, so `posts`/`reactions` call it directly through this helper instead.
 *
 * Keys are namespaced `<action>:subject:<actorId>`, the same shape `RateLimitService` uses,
 * so the two never collide even though they're independent counters.
 */
export async function enforceWindowRateLimit(
  store: DbRateLimitStore,
  action: string,
  actorId: string,
  limit: number,
  windowMs: number,
  now: Date = new Date(),
): Promise<void> {
  const count = await store.increment(`${action}:subject:${actorId}`, windowMs, now);
  if (count > limit) {
    const retryInSeconds = Math.ceil(windowMs / 1000);
    throw new AppError(
      'RATE_LIMITED',
      `Too many ${action.replace(/_/g, ' ')} actions. Try again in ${String(retryInSeconds)} seconds.`,
      { context: { action } },
    );
  }
}

/**
 * The peer-keyed sibling of {@link enforceWindowRateLimit} (P11-004, spec §102, §188): call it
 * *in addition to*, never instead of, the subject-keyed check above, for a write path that
 * needs both — `DirectMessageService.SendMessage`/`CreateConversation`, where a subject-only
 * budget alone would not stop one blocked-out attacker from spinning up many accounts to keep
 * messaging/requesting the same target (same reasoning as `RateLimitService.consumePeer`'s doc
 * comment). Keys are namespaced `<action>:peer:<peer>`, so this and the subject-keyed budget
 * above never collide even when called with the same `action` string.
 */
export async function enforceWindowPeerRateLimit(
  store: DbRateLimitStore,
  action: string,
  peer: string | undefined,
  limit: number,
  windowMs: number,
  now: Date = new Date(),
): Promise<void> {
  const count = await store.increment(`${action}:peer:${peer ?? 'unknown'}`, windowMs, now);
  if (count > limit) {
    const retryInSeconds = Math.ceil(windowMs / 1000);
    throw new AppError(
      'RATE_LIMITED',
      `Too many ${action.replace(/_/g, ' ')} actions. Try again in ${String(retryInSeconds)} seconds.`,
      { context: { action } },
    );
  }
}
