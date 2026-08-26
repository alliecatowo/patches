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
