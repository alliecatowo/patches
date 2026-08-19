import { describe, expect, it } from 'vitest';

import {
  COMMUNITY_NAME_MAX_CHARS,
  COMMUNITY_NAME_MIN_CHARS,
  COMMUNITY_NAME_PATTERN,
  DM_GROUP_MAX,
  MAX_ACTOR_FLAIR_BYTES,
  MAX_COMMUNITY_DESCRIPTION_CHARS,
  MAX_COMMUNITY_DISPLAY_NAME_CHARS,
  MAX_COMMUNITY_MODERATORS,
  MAX_COMMUNITY_RULES_BYTES,
  MAX_DM_BODY_CHARS,
  MAX_PINNED_POSTS,
  MAX_POST_CHARS,
  MAX_POST_CHARS_NODE_CEILING,
  MAX_POST_EDITS_PER_POST,
  MAX_QUOTED_POST_NESTING_RENDERED,
  MAX_TAG_NAME_CHARS,
  MAX_TAGS_PER_POST,
  MESSAGE_REQUEST_MAX_MESSAGES,
  MESSAGE_REQUEST_MAX_PENDING_PER_PAIR,
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
    expect(MAX_DM_BODY_CHARS).toBe(2_000);
    expect(DM_GROUP_MAX).toBe(8);
    expect(MESSAGE_REQUEST_MAX_PENDING_PER_PAIR).toBe(1);
    expect(MESSAGE_REQUEST_MAX_MESSAGES).toBe(1);
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

  it('matches the §188 rate-limit table', () => {
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
    });
  });
});
