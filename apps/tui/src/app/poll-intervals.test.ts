import { describe, expect, it } from 'vitest';

import {
  nextPollDelayMs,
  TUI_CONVERSATION_LIST_POLL_MS,
  TUI_POLL_BACKOFF_MAX_MS,
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

describe('nextPollDelayMs (P19-027: bounded backoff on transient DM-poll errors)', () => {
  const base = 5_000;

  it('stays at the base interval while healthy', () => {
    expect(nextPollDelayMs(0, base, TUI_POLL_BACKOFF_MAX_MS)).toBe(base);
  });

  it('doubles per consecutive failure, clamped at the max', () => {
    expect(nextPollDelayMs(1, base, TUI_POLL_BACKOFF_MAX_MS)).toBe(10_000);
    expect(nextPollDelayMs(2, base, TUI_POLL_BACKOFF_MAX_MS)).toBe(20_000);
    expect(nextPollDelayMs(3, base, TUI_POLL_BACKOFF_MAX_MS)).toBe(40_000);
    // base * 2^4 = 80s, clamped back down to the 60s ceiling.
    expect(nextPollDelayMs(4, base, TUI_POLL_BACKOFF_MAX_MS)).toBe(TUI_POLL_BACKOFF_MAX_MS);
    expect(nextPollDelayMs(10, base, TUI_POLL_BACKOFF_MAX_MS)).toBe(TUI_POLL_BACKOFF_MAX_MS);
  });
});
