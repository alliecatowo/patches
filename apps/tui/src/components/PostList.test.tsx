import { QUOTE_POLICY } from '../api/wire/enums.js';
import { fromDate } from '../api/wire/time.js';
import type { Post } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { ContentSizeProvider } from '../app/layout.js';
import { PlainModeProvider } from '../theme/plain-mode.js';
import { PostList } from './PostList.js';
import {
  makePost,
  makePostCounts,
  makePostViewerState,
  makeRemoteActor,
} from '../test/wire-fixtures.js';

function selectedPost(): Post {
  return makePost({
    author: undefined,
    body: 'hello',
    createdAt: fromDate(new Date()),
    counts: makePostCounts({ replies: 0, likes: 0, reposts: 0, quotes: 0 }),
    viewerState: makePostViewerState({ liked: false, bookmarked: false, reposted: false }),
    quotePolicy: QUOTE_POLICY.ANYONE,
  });
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

describe('PostList remote origin (P18-009)', () => {
  it('renders a remote reposter and remote quote embed through the full list, in rich mode', () => {
    const remoteQuoted = makePost({
      id: 'quoted-remote',
      body: 'quoted from another instance',
      author: makeRemoteActor({ handle: 'quinn' }),
    });
    const post = makePost({
      repostedBy: [makeRemoteActor({ handle: 'rae' })],
      repostedByTotal: 1,
      quotedPost: remoteQuoted,
    });
    const { lastFrame } = render(
      <ContentSizeProvider size={{ rows: 20, columns: 80 }}>
        <PostList posts={[post]} loading={false} hasMore={false} emptyMessage="empty" />
      </ContentSizeProvider>,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('↻ @rae (remote) reposted');
    expect(frame).toContain('quoted @quinn (remote)');
  });

  it('renders the same remote-origin markers in plain mode and existing row actions still fire (no new keys, §191)', () => {
    const post = makePost({
      repostedBy: [makeRemoteActor({ handle: 'rae' })],
      repostedByTotal: 1,
      quotePolicy: QUOTE_POLICY.ANYONE,
    });
    const onQuote = vi.fn();
    const { stdin, lastFrame } = render(
      <PlainModeProvider plain>
        <ContentSizeProvider size={{ rows: 16, columns: 80 }}>
          <PostList
            posts={[post]}
            loading={false}
            hasMore={false}
            emptyMessage="empty"
            isActive
            onQuote={onQuote}
          />
        </ContentSizeProvider>
      </PlainModeProvider>,
    );
    expect(lastFrame() ?? '').toContain('↻ @rae (remote) reposted');
    stdin.write('Q');
    expect(onQuote).toHaveBeenCalledOnce();
    expect(onQuote).toHaveBeenCalledWith(post);
  });
});
