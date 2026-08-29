/**
 * ADR 0032 ("DM delivery stays poll-based, with a stated freshness SLA") publishes the
 * TUI's DM freshness promise as a table of intervals. Before this file, each interval was
 * an independent `setInterval`/default-prop literal (`useUnreadCount.ts`,
 * `MessagesScreen.tsx`) with no shared source of truth, so tightening or loosening the
 * SLA meant hunting down every call site — and nothing caught a stray edit that quietly
 * broke the published promise. These constants are that source of truth:
 * `poll-intervals.test.ts` asserts each one against the ADR's numbers, so drift fails a
 * test instead of shipping silently.
 */

/** Unread-badge refresh while signed in, anywhere in the app (ADR 0032 §1: within 60s). */
export const TUI_UNREAD_BADGE_POLL_MS = 60_000;

/**
 * Conversation-list refresh while the list is open and focused (ADR 0032 §1: "Sitting on
 * the TUI conversation list ... within 60s"). Polling stops while the screen is not the
 * active one, matching every other poll in this client.
 */
export const TUI_CONVERSATION_LIST_POLL_MS = 60_000;

/** In-thread end-to-end mailbox drain while a thread is open (ADR 0032 §1: within ~5s). */
export const TUI_THREAD_MAIL_POLL_MS = 5_000;

/** Peer identity/roster re-check while an end-to-end thread is open (ADR 0032's fact 5). */
export const TUI_THREAD_SECURITY_POLL_MS = 30_000;

/**
 * Ceiling for the in-thread mailbox-drain backoff on consecutive transient errors
 * (P19-027, issue #384). When the drain keeps failing we stop hammering
 * `ListMailboxEnvelopes` at the fixed 5s cadence and double the gap up to this cap, then
 * hold there until a drain succeeds and resets back to the base interval. 60s is ADR 0032's
 * list/badge freshness tier: a failed drain cannot leave the thread stale for longer than
 * the healthiest surface's promise.
 */
export const TUI_POLL_BACKOFF_MAX_MS = 60_000;

/**
 * Pure backoff step for a poll loop (P19-027, issue #384): given `consecutiveFailures` since
 * the last success, return the delay before the next poll. `0`/healthy stays at `baseMs`;
 * each failure doubles the gap, clamped at `maxMs`. Callers keep the count in the effect
 * closure and reset it to `0` when a poll succeeds, so one success collapses the delay back
 * to `baseMs` immediately.
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
