import { POST_TYPE, POST_VISIBILITY, QUOTE_POLICY } from '@patches/proto';
import type { Post, Tag } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { stripSgr } from '../../test/ansi.js';
import { TagFeedScreen, type TagFeedScreenApi } from './TagFeedScreen.js';

const KEY = { enter: '\r' } as const;

function tag(id: string, name: string): Tag {
  return { id, name, displayName: name, createdAt: undefined };
}

function post(body: string, id = 'post-1'): Post {
  return {
    id,
    author: {
      id: 'actor-1',
      handle: 'alice',
      displayName: '',
      bio: '',
      locationText: '',
      websiteUrl: '',
      avatar: undefined,
      isLocal: true,
      joinedAt: undefined,
      counts: undefined,
      nameplate: undefined,
      flair: undefined,
      pinnedPostIds: [],
    },
    body,
    postType: POST_TYPE.NOTE,
    linkUrl: '',
    visibility: POST_VISIBILITY.PUBLIC,
    inReplyToId: '',
    rootPostId: id,
    media: [],
    createdAt: undefined,
    editedAt: undefined,
    deleted: false,
    counts: undefined,
    viewerState: undefined,
    contentWarning: '',
    quotedPost: undefined,
    community: undefined,
    quotePolicy: QUOTE_POLICY.UNSPECIFIED,
    repostedBy: [],
    repostedByTotal: 0,
    filteredBy: undefined,
    labels: [],
  };
}

interface FakeApi extends TagFeedScreenApi {
  searchTags: ReturnType<typeof vi.fn<TagFeedScreenApi['searchTags']>>;
  listTagFeed: ReturnType<typeof vi.fn<TagFeedScreenApi['listTagFeed']>>;
  muteTag: ReturnType<typeof vi.fn<TagFeedScreenApi['muteTag']>>;
  unmuteTag: ReturnType<typeof vi.fn<TagFeedScreenApi['unmuteTag']>>;
}

function fakeApi(): FakeApi {
  return {
    target: 'node.test:443',
    searchTags: vi.fn().mockResolvedValue({ tags: [], page: undefined }),
    listTagFeed: vi.fn().mockResolvedValue({ posts: [], page: undefined }),
    muteTag: vi.fn().mockResolvedValue({}),
    unmuteTag: vi.fn().mockResolvedValue({}),
  };
}

/** Frames carry SGR colour (see `vitest.config.ts`), so match on characters. */
async function waitForFrame(lastFrame: () => string | undefined, text: string): Promise<string> {
  const deadline = Date.now() + 2_000;
  let frame = stripSgr(lastFrame() ?? '');
  while (!frame.includes(text)) {
    if (Date.now() >= deadline)
      throw new Error(`Timed out waiting for ${text}. Last frame:\n${frame}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    frame = stripSgr(lastFrame() ?? '');
  }
  return frame;
}

describe('TagFeedScreen', () => {
  it('sorts search results alphabetically and sanitizes remote names', async () => {
    const api = fakeApi();
    api.searchTags.mockResolvedValue({
      tags: [tag('z', 'zebra'), tag('a', 'alpha\x1b[2J')],
      page: undefined,
    });
    const { lastFrame, stdin } = render(<TagFeedScreen api={api} isActive onCancel={vi.fn()} />);
    stdin.write('a');
    await waitForFrame(lastFrame, 'tag #a');
    stdin.write(KEY.enter);
    const frame = await waitForFrame(lastFrame, '#alpha[2J');
    expect(frame.indexOf('#alpha[2J')).toBeLessThan(frame.indexOf('#zebra'));
    expect(api.searchTags).toHaveBeenCalledWith({ query: 'a', cursor: '', limit: 20 }, undefined);
  });

  it('keeps an explicitly opened feed visible after muting it', async () => {
    const api = fakeApi();
    api.listTagFeed.mockResolvedValue({
      posts: [post('A chronological post')],
      page: { nextCursor: 'opaque-next', hasMore: true },
    });
    const opened = tag('tag-1', 'typescript');
    const { lastFrame, stdin } = render(
      <TagFeedScreen
        api={api}
        isActive
        initialTag={opened}
        ensureAccessToken={() => Promise.resolve('token')}
        onCancel={vi.fn()}
      />,
    );
    await waitForFrame(lastFrame, 'A chronological post');
    expect(api.listTagFeed).toHaveBeenCalledWith(
      { tag: 'typescript', cursor: '', limit: 20 },
      'token',
    );

    stdin.write('M');
    const muted = await waitForFrame(lastFrame, 'muted (explicit view remains open)');
    expect(muted).toContain('A chronological post');
    expect(api.muteTag).toHaveBeenCalledWith({ tagId: 'tag-1' }, 'token');

    stdin.write('M');
    await waitForFrame(lastFrame, 'not muted');
    expect(api.unmuteTag).toHaveBeenCalledWith({ tagId: 'tag-1' }, 'token');
  });

  it('uses opaque feed cursors for chronological paging', async () => {
    const api = fakeApi();
    api.listTagFeed
      .mockResolvedValueOnce({
        posts: [post('first')],
        page: { nextCursor: 'opaque', hasMore: true },
      })
      .mockResolvedValueOnce({
        posts: [post('second', 'post-2')],
        page: { nextCursor: '', hasMore: false },
      });
    const { lastFrame, stdin } = render(
      <TagFeedScreen api={api} isActive initialTag={tag('tag-1', 'alpha')} onCancel={vi.fn()} />,
    );
    await waitForFrame(lastFrame, 'first');
    stdin.write('n');
    await waitForFrame(lastFrame, 'second');
    expect(api.listTagFeed).toHaveBeenLastCalledWith(
      { tag: 'alpha', cursor: 'opaque', limit: 20 },
      undefined,
    );
  });
});
