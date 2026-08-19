import {
  POST_TYPE,
  POST_VISIBILITY,
  QUOTE_POLICY,
  type Actor,
  type Post,
  type Tag,
} from '@patches/proto';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { MemoryRecentQueriesStore } from '../search/recent-queries.js';
import { stripSgr } from '../../test/ansi.js';
import { SearchScreen } from './SearchScreen.js';

const KEY = {
  enter: '\r',
  tab: '\t',
  up: '\x1b[A',
  down: '\x1b[B',
  escape: '\x1b',
} as const;

function actor(id: string, handle: string): Actor {
  return {
    id,
    handle,
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
  };
}

function tag(id: string, name: string): Tag {
  return { id, name, displayName: name, createdAt: undefined };
}

function post(body: string, id = 'post-1'): Post {
  return {
    id,
    author: actor('actor-1', 'alice'),
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

function buildApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    searchActors: vi.fn().mockResolvedValue({ actors: [], page: undefined }),
    searchPosts: vi.fn().mockResolvedValue({ posts: [], page: undefined }),
    searchTags: vi.fn().mockResolvedValue({ tags: [], page: undefined }),
    resolveActor: vi.fn().mockResolvedValue({ actor: undefined }),
    ...overrides,
  } as unknown as PatchesApi;
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

function type(stdin: { write: (data: string) => void }, text: string): void {
  for (const char of text) stdin.write(char);
}

describe('SearchScreen', () => {
  it('defaults to people mode and searches actors on Enter', async () => {
    const searchActors = vi
      .fn()
      .mockResolvedValue({ actors: [actor('a1', 'alice')], page: undefined });
    const api = buildApi({ searchActors });
    const { lastFrame, stdin } = render(
      <SearchScreen
        api={api}
        isActive
        onOpenActor={vi.fn()}
        onCancel={vi.fn()}
        recentQueriesStore={new MemoryRecentQueriesStore()}
      />,
    );
    type(stdin, 'alice');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, '@alice');
    expect(searchActors).toHaveBeenCalledWith({ query: 'alice', cursor: '', limit: 20 });
  });

  it('switches mode with Tab, cycling people -> posts -> tags -> people', async () => {
    const api = buildApi();
    const { lastFrame, stdin } = render(
      <SearchScreen
        api={api}
        isActive
        onOpenActor={vi.fn()}
        onCancel={vi.fn()}
        recentQueriesStore={new MemoryRecentQueriesStore()}
      />,
    );
    await waitForFrame(lastFrame, '[people]');
    stdin.write(KEY.tab);
    await waitForFrame(lastFrame, '[posts]');
    stdin.write(KEY.tab);
    await waitForFrame(lastFrame, '[tags]');
    stdin.write(KEY.tab);
    await waitForFrame(lastFrame, '[people]');
  });

  it('switches mode with 1/2/3 while the query field is empty', async () => {
    const api = buildApi();
    const { lastFrame, stdin } = render(
      <SearchScreen
        api={api}
        isActive
        onOpenActor={vi.fn()}
        onCancel={vi.fn()}
        recentQueriesStore={new MemoryRecentQueriesStore()}
      />,
    );
    await waitForFrame(lastFrame, '[people]');
    stdin.write('2');
    await waitForFrame(lastFrame, '[posts]');
    stdin.write('3');
    await waitForFrame(lastFrame, '[tags]');
    stdin.write('1');
    await waitForFrame(lastFrame, '[people]');
  });

  it('treats a digit as ordinary text once the query field is non-empty', async () => {
    const api = buildApi();
    const { lastFrame, stdin } = render(
      <SearchScreen
        api={api}
        isActive
        onOpenActor={vi.fn()}
        onCancel={vi.fn()}
        recentQueriesStore={new MemoryRecentQueriesStore()}
      />,
    );
    type(stdin, 'since:2026-01-15');
    const frame = await waitForFrame(lastFrame, 'since:2026-01-15');
    expect(frame).toContain('[people]');
  });

  it('parses since:/from:/#tag out of a posts query, applies from: server-side and shows a filtered-locally note for since:/#tag', async () => {
    const inSince = post('tagged post about #patches', 'p1');
    const outSince = post('another #patches post', 'p2');
    const searchPosts = vi.fn().mockResolvedValue({
      posts: [inSince, outSince],
      page: { nextCursor: '', hasMore: false },
    });
    const api = buildApi({ searchPosts });
    const { lastFrame, stdin } = render(
      <SearchScreen
        api={api}
        isActive
        onOpenActor={vi.fn()}
        onCancel={vi.fn()}
        recentQueriesStore={new MemoryRecentQueriesStore()}
      />,
    );
    stdin.write(KEY.tab); // -> posts
    await waitForFrame(lastFrame, '[posts]');
    type(stdin, 'rust since:2026-01-01 from:@alice #patches');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, 'filtered locally');
    expect(searchPosts).toHaveBeenCalledWith(
      {
        query: 'rust',
        cursor: '',
        limit: 20,
        authorHandle: 'alice',
        includeReplies: true,
      },
      undefined,
    );
  });

  it('never sends a sort/order field — SearchPostsRequest has no such field to send', async () => {
    const api = buildApi({
      searchPosts: vi.fn().mockResolvedValue({ posts: [], page: undefined }),
    });
    const { lastFrame, stdin } = render(
      <SearchScreen
        api={api}
        isActive
        onOpenActor={vi.fn()}
        onCancel={vi.fn()}
        recentQueriesStore={new MemoryRecentQueriesStore()}
      />,
    );
    stdin.write(KEY.tab);
    await waitForFrame(lastFrame, '[posts]');
    type(stdin, 'rust');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, 'No posts matched.');
    const sent = (api.searchPosts as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(sent)).not.toContain('sort');
    expect(Object.keys(sent)).not.toContain('order');
  });

  it('searches tags in tags mode and opens the selected tag on Enter', async () => {
    const onOpenTag = vi.fn();
    const api = buildApi({
      searchTags: vi.fn().mockResolvedValue({ tags: [tag('t1', 'patches')], page: undefined }),
    });
    const { lastFrame, stdin } = render(
      <SearchScreen
        api={api}
        isActive
        onOpenActor={vi.fn()}
        onOpenTag={onOpenTag}
        onCancel={vi.fn()}
        recentQueriesStore={new MemoryRecentQueriesStore()}
      />,
    );
    stdin.write(KEY.tab);
    stdin.write(KEY.tab);
    await waitForFrame(lastFrame, '[tags]');
    type(stdin, 'patches');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, '#patches');
    stdin.write(KEY.enter);
    expect(onOpenTag).toHaveBeenCalledWith(tag('t1', 'patches'));
  });

  it('recalls the last 20 queries with Up and steps back out with Down', async () => {
    const store = new MemoryRecentQueriesStore(['second search', 'first search']);
    const api = buildApi();
    const { lastFrame, stdin } = render(
      <SearchScreen
        api={api}
        isActive
        onOpenActor={vi.fn()}
        onCancel={vi.fn()}
        recentQueriesStore={store}
      />,
    );
    await waitForFrame(lastFrame, 'recalls your last search');
    stdin.write(KEY.up);
    await waitForFrame(lastFrame, 'second search');
    stdin.write(KEY.up);
    await waitForFrame(lastFrame, 'first search');
    stdin.write(KEY.down);
    await waitForFrame(lastFrame, 'second search');
  });

  it('records a run query so it is recallable afterward', async () => {
    const store = new MemoryRecentQueriesStore([]);
    const api = buildApi({
      searchActors: vi.fn().mockResolvedValue({ actors: [actor('a1', 'alice')], page: undefined }),
    });
    const { lastFrame, stdin } = render(
      <SearchScreen
        api={api}
        isActive
        onOpenActor={vi.fn()}
        onCancel={vi.fn()}
        recentQueriesStore={store}
      />,
    );
    type(stdin, 'alice');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, '@alice');
    expect(await store.load()).toEqual(['alice']);
  });

  it('Esc leaves the screen without picking anyone', async () => {
    const onCancel = vi.fn();
    const api = buildApi();
    const { lastFrame, stdin } = render(
      <SearchScreen
        api={api}
        isActive
        onOpenActor={vi.fn()}
        onCancel={onCancel}
        recentQueriesStore={new MemoryRecentQueriesStore()}
      />,
    );
    // A fresh mount's `useInput` subscribes on a later effect tick, not the mount
    // commit itself — wait for the first frame before sending Esc, or the keypress
    // lands in that gap and is dropped rather than delayed.
    await waitForFrame(lastFrame, '[people]');
    stdin.write(KEY.escape);
    // A solo Escape needs a short window to distinguish from the start of a
    // multi-byte escape sequence before Ink's keypress decoder fires `key.escape`.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onCancel).toHaveBeenCalled();
  });
});
