import { POST_TYPE, POST_VISIBILITY, QUOTE_POLICY } from '../api/wire/enums.js';
import { dateToTimestamp } from '@patches/proto';
import type { Post } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { ContentSizeProvider } from '../app/layout.js';
import { PostList } from './PostList.js';

function selectedPost(): Post {
  return {
    id: 'post-1',
    author: undefined,
    body: 'hello',
    postType: POST_TYPE.NOTE,
    linkUrl: '',
    visibility: POST_VISIBILITY.PUBLIC,
    inReplyToId: '',
    rootPostId: 'post-1',
    media: [],
    createdAt: dateToTimestamp(new Date()),
    editedAt: undefined,
    deleted: false,
    counts: { replies: 0, likes: 0, reposts: 0, quotes: 0 },
    viewerState: { liked: false, bookmarked: false, reposted: false },
    contentWarning: '',
    quotedPost: undefined,
    community: undefined,
    quotePolicy: QUOTE_POLICY.ANYONE,
    repostedBy: [],
    repostedByTotal: 0,
    filteredBy: undefined,
    labels: [],
  };
}

describe('PostList Amendment B row actions', () => {
  it('dispatches repost, quote, edit, delete, history, and pin for the selected row', () => {
    const post = selectedPost();
    const onToggleRepost = vi.fn();
    const onQuote = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onHistory = vi.fn();
    const onTogglePin = vi.fn();
    const { stdin } = render(
      <ContentSizeProvider size={{ rows: 16, columns: 80 }}>
        <PostList
          posts={[post]}
          loading={false}
          hasMore={false}
          emptyMessage="empty"
          isActive
          onToggleRepost={onToggleRepost}
          onQuote={onQuote}
          onEdit={onEdit}
          onDelete={onDelete}
          onHistory={onHistory}
          onTogglePin={onTogglePin}
        />
      </ContentSizeProvider>,
    );

    // `E` edits the selected post; lower-case `e` belongs to the profile and page
    // screens (`KEYMAP`), and `PostList` used to shadow it.
    for (const key of ['R', 'Q', 'E', 'd', 'H', 'I']) stdin.write(key);

    for (const callback of [onToggleRepost, onQuote, onEdit, onDelete, onHistory, onTogglePin]) {
      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(post);
    }
  });
});
