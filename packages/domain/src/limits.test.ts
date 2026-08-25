import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_DELETION_GRACE_PERIOD_DAYS_DEFAULT,
  ACCOUNT_EXPORT_EXPIRES_AFTER_DAYS,
  ACCOUNT_EXPORT_MAX_READY_ARCHIVES,
  APPEAL_WINDOW_DAYS_DEFAULT,
  COMMUNITY_NAME_MAX_CHARS,
  COMMUNITY_NAME_MIN_CHARS,
  COMMUNITY_NAME_PATTERN,
  MAX_ACTOR_FLAIR_BYTES,
  MAX_APPEAL_STATEMENT_CHARS,
  MAX_COMMUNITY_DESCRIPTION_CHARS,
  MAX_COMMUNITY_DISPLAY_NAME_CHARS,
  MAX_COMMUNITY_MODERATORS,
  MAX_COMMUNITY_RULES_BYTES,
  MAX_FILTER_LIST_ENTRIES,
  MAX_FILTER_LIST_EXCEPTIONS_PER_LIST,
  MAX_FILTER_LIST_SUBSCRIPTIONS,
  MAX_FILTER_LISTS_PUBLISHED_PER_ACTOR,
  MAX_FILTER_TERMS_PER_FILTER,
  MAX_FILTERS_PER_ACTOR,
  MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR,
  MAX_PINNED_POSTS,
  MAX_POST_CHARS,
  MAX_POST_CHARS_NODE_CEILING,
  MAX_POST_EDITS_PER_POST,
  MAX_QUOTED_POST_NESTING_RENDERED,
  MAX_TAG_NAME_CHARS,
  MAX_TAGS_PER_POST,
  RATE_LIMITS,
} from './limits.js';

/**
 * `INITIAL_VISION.md` §188's size/rate-limit table, restated here as assertions so a future
 * edit to `limits.ts` that silently drifts from the spec fails loudly instead of quietly
 * shipping a wrong number.
 */
describe('Amendment B size limits (§188)', () => {
  it('matches the §188 size-limit table', () => {
    expect(MAX_TAG_NAME_CHARS).toBe(30);
    expect(MAX_TAGS_PER_POST).toBe(10);
    expect(COMMUNITY_NAME_MIN_CHARS).toBe(3);
    expect(COMMUNITY_NAME_MAX_CHARS).toBe(32);
    expect(MAX_COMMUNITY_DISPLAY_NAME_CHARS).toBe(80);
    expect(MAX_COMMUNITY_DESCRIPTION_CHARS).toBe(500);
    expect(MAX_COMMUNITY_RULES_BYTES).toBe(4 * 1024);
    expect(MAX_COMMUNITY_MODERATORS).toBe(16);
    expect(MAX_ACTOR_FLAIR_BYTES).toBe(1 * 1024);
    expect(MAX_PINNED_POSTS).toBe(3);
    expect(MAX_QUOTED_POST_NESTING_RENDERED).toBe(1);
    expect(MAX_POST_EDITS_PER_POST).toBe(20);
    expect(MAX_POST_CHARS).toBe(5_000);
    expect(MAX_POST_CHARS_NODE_CEILING).toBe(10_000);
  });

  it('COMMUNITY_NAME_PATTERN accepts exactly [a-z0-9_]{3,32}', () => {
    expect(COMMUNITY_NAME_PATTERN.test('abc')).toBe(true);
    expect(COMMUNITY_NAME_PATTERN.test('a_b_c_123')).toBe(true);
    expect(COMMUNITY_NAME_PATTERN.test('a'.repeat(32))).toBe(true);

    expect(COMMUNITY_NAME_PATTERN.test('ab')).toBe(false); // too short
    expect(COMMUNITY_NAME_PATTERN.test('a'.repeat(33))).toBe(false); // too long
    expect(COMMUNITY_NAME_PATTERN.test('Abc')).toBe(false); // uppercase
    expect(COMMUNITY_NAME_PATTERN.test('ab c')).toBe(false); // space
    expect(COMMUNITY_NAME_PATTERN.test('ab-c')).toBe(false); // hyphen not allowed
  });

  it('matches the §188 + §204 rate-limit table', () => {
    expect(RATE_LIMITS).toEqual({
      repostPerHour: 60,
      quotePerHour: 30,
      postEditPerHour: 30,
      communityCreatePerDay: 2,
      communityJoinPerDay: 50,
      communityInvitePerDay: 20,
      communityInvitePerCommunityPerHour: 5,
      dmSendPerMinute: 20,
      dmSendPerHour: 300,
      messageRequestPerHour: 5,
      messageRequestPerDay: 20,
      tagMuteTotal: 100,
      filterCreateOrUpdatePerHour: 30,
      filterListPublishOrUpdatePerHour: 10,
      filterListSubscribePerHour: 50,
      labelApplyPerDayPerLabeler: 300,
      appealFiledPerDay: 5,
      exportRequestedPerDay: 3,
      accountDeletionRequestedOrCancelledPerDay: 5,
    });
  });
});

/**
 * `INITIAL_VISION.md` §204's size-limit table (Amendment C — privacy, filters, filter lists,
 * labelers, appeals, account lifecycle), restated as assertions for the same reason §188's
 * table is above.
 */
describe('Amendment C size limits (§204)', () => {
  it('matches the §204 size-limit table', () => {
    expect(MAX_FILTERS_PER_ACTOR).toBe(50);
    expect(MAX_FILTER_TERMS_PER_FILTER).toBe(20);
    expect(MAX_FILTER_LISTS_PUBLISHED_PER_ACTOR).toBe(10);
    expect(MAX_FILTER_LIST_ENTRIES).toBe(2_000);
    expect(MAX_FILTER_LIST_SUBSCRIPTIONS).toBe(100);
    expect(MAX_FILTER_LIST_EXCEPTIONS_PER_LIST).toBe(200);
    expect(MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR).toBe(50);
    expect(MAX_APPEAL_STATEMENT_CHARS).toBe(2_000);
    expect(ACCOUNT_EXPORT_MAX_READY_ARCHIVES).toBe(1);
    expect(ACCOUNT_EXPORT_EXPIRES_AFTER_DAYS).toBe(7);
    expect(ACCOUNT_DELETION_GRACE_PERIOD_DAYS_DEFAULT).toBe(30);
    expect(APPEAL_WINDOW_DAYS_DEFAULT).toBe(14);
  });
});
