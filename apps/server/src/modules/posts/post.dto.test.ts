import type { Actor as ActorEntity, Post as PostEntity } from '@patches/database';
import { describe, expect, it } from 'vitest';

import { toPostView } from './post.dto.js';

// Minimal fixtures: only the columns `toPostView` reads. Casts are a test-fixture shortcut,
// never a production pattern — `toPostView` never sees these types at runtime.
function actorFixture(overrides: Partial<ActorEntity> = {}): ActorEntity {
  return {
    id: 'actor-1',
    handle: 'alice',
    displayName: null,
    bio: null,
    locationText: null,
    websiteUrl: null,
    isLocal: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    homeServer: null,
    ...overrides,
  } as ActorEntity;
}

function postFixture(
  overrides: Partial<PostEntity> = {},
): PostEntity & { authorActor: ActorEntity } {
  return {
    id: 'post-1',
    authorActor: actorFixture(),
    body: 'hello',
    postType: 'NOTE',
    linkUrl: null,
    visibility: 'PUBLIC',
    contentWarning: null,
    inReplyToId: null,
    rootPostId: 'post-1',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    editedAt: null,
    deletedAt: null,
    quotedPostId: null,
    quotePolicy: 'ANYONE',
    originServer: null,
    ...overrides,
  } as PostEntity & { authorActor: ActorEntity };
}

const zeroCounts = { replyCount: 0, likeCount: 0, repostCount: 0, quoteCount: 0 };
const noViewerState = { liked: false, bookmarked: false, reposted: false };

describe('toPostView', () => {
  it('carries a post’s null originServer through unchanged for a locally authored post (spec §163)', () => {
    const view = toPostView(postFixture({ originServer: null }), [], zeroCounts, noViewerState);
    expect(view.originServer).toBeNull();
  });

  it('carries a federated post’s originServer domain through unchanged', () => {
    const view = toPostView(
      postFixture({ originServer: 'remote.example' }),
      [],
      zeroCounts,
      noViewerState,
    );
    expect(view.originServer).toBe('remote.example');
  });
});
