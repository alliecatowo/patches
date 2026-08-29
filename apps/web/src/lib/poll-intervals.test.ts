import { describe, expect, it } from 'vitest';

import {
  nextPollDelayMs,
  POLL_BACKOFF_MAX_MS,
  WEB_DM_POLL_MS,
  WEB_UNREAD_BADGE_POLL_MS,
} from './poll-intervals.js';

/**
 * Drift guard for ADR 0032's published DM freshness SLA (§1's table): a change to either
 * constant must be a conscious, reviewed edit to the published promise, not a side
 * effect of an unrelated change. If the SLA is ever renegotiated, update both this test
 * and the ADR in the same change.
 */
describe('web poll intervals match ADR 0032', () => {
  it('unread badge: within 30s while signed in', () => {
    expect(WEB_UNREAD_BADGE_POLL_MS).toBe(30_000);
  });

  it('DM list / thread metadata: within 60s while the tab is focused', () => {
    expect(WEB_DM_POLL_MS).toBe(60_000);
  });
});

describe('nextPollDelayMs (P19-027: bounded backoff on transient DM-poll errors)', () => {
  const base = 8_000;

  it('stays at the base interval while healthy', () => {
    expect(nextPollDelayMs(0, base, POLL_BACKOFF_MAX_MS)).toBe(base);
  });

  it('doubles per consecutive failure, clamped at the max', () => {
    expect(nextPollDelayMs(1, base, POLL_BACKOFF_MAX_MS)).toBe(16_000);
    expect(nextPollDelayMs(2, base, POLL_BACKOFF_MAX_MS)).toBe(32_000);
    // base * 2^4 = 128s, clamped back down to the 60s ceiling.
    expect(nextPollDelayMs(4, base, POLL_BACKOFF_MAX_MS)).toBe(POLL_BACKOFF_MAX_MS);
    expect(nextPollDelayMs(10, base, POLL_BACKOFF_MAX_MS)).toBe(POLL_BACKOFF_MAX_MS);
  });

  it('never exceeds the ceiling, whatever the base', () => {
    expect(nextPollDelayMs(5, 8_000, POLL_BACKOFF_MAX_MS)).toBe(POLL_BACKOFF_MAX_MS);
  });
});
