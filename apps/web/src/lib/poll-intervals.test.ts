import { describe, expect, it } from 'vitest';

import { WEB_DM_POLL_MS, WEB_UNREAD_BADGE_POLL_MS } from './poll-intervals.js';

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
