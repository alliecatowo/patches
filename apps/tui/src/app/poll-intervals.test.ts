import { describe, expect, it } from 'vitest';

import {
  TUI_CONVERSATION_LIST_POLL_MS,
  TUI_THREAD_MAIL_POLL_MS,
  TUI_THREAD_SECURITY_POLL_MS,
  TUI_UNREAD_BADGE_POLL_MS,
} from './poll-intervals.js';

/**
 * Drift guard for ADR 0032's published DM freshness SLA (§1's table): a change to any of
 * these constants must be a conscious, reviewed edit to the published promise, not a
 * side effect of an unrelated change. If the SLA is ever renegotiated, update both this
 * test and the ADR in the same change.
 */
describe('TUI poll intervals match ADR 0032', () => {
  it('unread badge: within 60s, anywhere while signed in', () => {
    expect(TUI_UNREAD_BADGE_POLL_MS).toBe(60_000);
  });

  it('conversation list: within 60s while open and focused', () => {
    expect(TUI_CONVERSATION_LIST_POLL_MS).toBe(60_000);
  });

  it('in-thread mailbox: within ~5s while a thread is open', () => {
    expect(TUI_THREAD_MAIL_POLL_MS).toBe(5_000);
  });

  it('in-thread peer security re-check: 30s while a thread is open', () => {
    expect(TUI_THREAD_SECURITY_POLL_MS).toBe(30_000);
  });
});
