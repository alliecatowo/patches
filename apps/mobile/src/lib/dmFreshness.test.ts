import { describe, expect, it } from 'vitest';

import { DM_ARRIVAL_NOTE } from './dmFreshness.js';

/**
 * P19-016: mobile has no dedicated DM/messages screen and no push registration — the
 * `NotificationType.MESSAGE` row in `NotificationsScreen` is its only signal that a
 * message arrived, and only ever on open/pull-to-refresh. Guard both halves of that
 * promise: the note must say so, and no string here may claim push/live/instant/realtime
 * delivery.
 */
describe('DM_ARRIVAL_NOTE', () => {
  it('states there is no push or background arrival signal', () => {
    expect(DM_ARRIVAL_NOTE).toMatch(/no push or background signal/i);
    expect(DM_ARRIVAL_NOTE).toMatch(/open or pull to refresh/i);
  });

  it('never implies push, live, instant, or realtime delivery', () => {
    expect(DM_ARRIVAL_NOTE).not.toMatch(
      /\blive\b|\binstant(ly)?\b|\brealtime\b|push notification/i,
    );
  });
});
