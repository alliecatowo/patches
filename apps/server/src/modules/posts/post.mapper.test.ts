import { describe, expect, it } from 'vitest';

import type { ActorSummary } from '../auth/auth.dto.js';
import { toProtoPost } from './post.mapper.js';
import type { PostView } from './post.dto.js';

function actorSummaryFixture(overrides: Partial<ActorSummary> = {}): ActorSummary {
  return {
    id: 'actor-1',
    handle: 'alice',
    displayName: null,
    bio: null,
    locationText: null,
    websiteUrl: null,
    isLocal: true,
    joinedAt: new Date('2024-01-01T00:00:00Z'),
    homeServer: null,
    ...overrides,
  };
}

function postViewFixture(overrides: Partial<PostView> = {}): PostView {
  return {
    id: 'post-1',
    author: actorSummaryFixture(),
    body: 'hello',
    postType: 'NOTE',
    linkUrl: null,
    visibility: 'PUBLIC',
    contentWarning: null,
    inReplyToId: null,
    rootPostId: 'post-1',
    media: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    editedAt: null,
    deleted: false,
    counts: { replyCount: 0, likeCount: 0, repostCount: 0, quoteCount: 0 },
    viewerState: { liked: false, bookmarked: false, reposted: false },
    quotedPostId: null,
    quotedPost: null,
    community: null,
    quotePolicy: 'ANYONE',
    repostedBy: [],
    repostedByTotal: 0,
    labels: [],
    filteredBy: null,
    originServer: null,
    ...overrides,
  };
}

describe('toProtoPost', () => {
  it('renders a post authored on this node’s null originServer as the wire’s empty string (spec §163)', () => {
    const proto = toProtoPost(postViewFixture({ originServer: null }));
    expect(proto.originServer).toBe('');
  });

  it('renders a federated post’s originServer domain unchanged', () => {
    const proto = toProtoPost(postViewFixture({ originServer: 'remote.example' }));
    expect(proto.originServer).toBe('remote.example');
  });
});
