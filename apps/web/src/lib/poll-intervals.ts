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
