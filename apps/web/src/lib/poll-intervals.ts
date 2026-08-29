/**
 * ADR 0032 ("DM delivery stays poll-based, with a stated freshness SLA") publishes this
 * client's DM freshness promise as a table of intervals. Before this file, the unread
 * badge (`RootLayout.tsx`) had its own inline literal and the DM list/thread queries had
 * no interval at all — two independent facts with no shared source of truth. These
 * constants are that source of truth: `poll-intervals.test.ts` asserts each one against
 * the ADR's published numbers, so drift fails a test instead of shipping silently.
 */

/** Unread-notification badge refresh while signed in (ADR 0032 §1: within 30s). */
export const WEB_UNREAD_BADGE_POLL_MS = 30_000;

/**
 * DM conversation list and open-thread metadata refresh while the tab is focused
 * (ADR 0032 §1: "updates within 60s while the tab is focused"). Paired with
 * `refetchIntervalInBackground` left at its TanStack Query default (`false`), which
 * already suspends this interval while the tab is hidden/unfocused — see
 * `docs/research/tanstack-query.md`.
 */
export const WEB_DM_POLL_MS = 60_000;

/**
 * Ceiling for the DM-poll backoff on consecutive transient errors (P19-027, issue #384).
 * When the thread drain keeps failing we stop hammering the endpoint at the fixed 8s cadence
 * and double the gap up to this cap, then hold there until a poll succeeds and resets back to
 * the base interval. 60s is the ADR 0032 list/badge freshness tier: recovering within that, a
 * failed drain cannot leave the inbox stale for longer than the healthiest surface's promise.
 */
export const POLL_BACKOFF_MAX_MS = 60_000;

/**
 * Pure backoff step for a poll loop (P19-027, issue #384): given `consecutiveFailures` since the
 * last success, return the delay before the next poll. `0`/healthy stays at `baseMs`; each failure
 * doubles the gap, clamped at `maxMs`. Callers keep the count in the effect closure and reset it
 * to `0` when a poll succeeds, so one success collapses the delay back to `baseMs` immediately.
 */
export function nextPollDelayMs(
  consecutiveFailures: number,
  baseMs: number,
  maxMs: number,
): number {
  if (consecutiveFailures <= 0) return baseMs;
  const exponential = baseMs * 2 ** consecutiveFailures;
  return Math.min(exponential, maxMs);
}
