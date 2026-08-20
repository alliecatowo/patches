import { Text } from 'ink';
import { render } from 'ink-testing-library';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { usePaginatedPosts, type PostPage } from './usePaginatedPosts.js';
import { makePageInfo } from '../test/wire-fixtures.js';

function Harness({
  fetch,
  cacheKey,
}: {
  fetch: (cursor: string) => Promise<PostPage>;
  cacheKey?: string;
}): ReactElement {
  const { posts, loading } = usePaginatedPosts('patches.test:50051', fetch, cacheKey);
  return <Text>{`loading:${String(loading)} posts:${String(posts.length)}`}</Text>;
}

function page(): Promise<PostPage> {
  // A real `Post` isn't needed — only the count and the `loading` flag are asserted.
  return Promise.resolve({ posts: [{}, {}] as never[], page: makePageInfo() });
}

describe('usePaginatedPosts background-snapshot cache (B-043)', () => {
  it('seeds a second mount sharing a cacheKey from the first mount, with no second fetch', async () => {
    const fetchPage = vi.fn(page);
    const key = 'home:patches.test:50051:0';

    const first = render(<Harness fetch={fetchPage} cacheKey={key} />);
    await vi.waitFor(() => expect(first.lastFrame()).toContain('loading:false'));
    expect(first.lastFrame()).toContain('posts:2');
    first.unmount();

    fetchPage.mockClear();
    // The overlay's `renderToString` snapshot is exactly this: an independent second
    // mount of the same screen. Left uncached it would render `loading:true` on its
    // very first (and only, frozen) frame — the "Loading" the owner reported seeing
    // under an already-loaded feed.
    const second = render(<Harness fetch={fetchPage} cacheKey={key} />);
    expect(second.lastFrame()).toContain('loading:false');
    expect(second.lastFrame()).toContain('posts:2');
    expect(fetchPage).not.toHaveBeenCalled();
    second.unmount();
  });

  it('still fetches fresh with no cacheKey — the default is unchanged', async () => {
    const fetchPage = vi.fn(page);
    const { lastFrame, unmount } = render(<Harness fetch={fetchPage} />);
    expect(lastFrame()).toContain('loading:true');
    await vi.waitFor(() => expect(lastFrame()).toContain('loading:false'));
    expect(fetchPage).toHaveBeenCalledOnce();
    unmount();
  });

  it('a new cacheKey (e.g. a bumped refresh nonce) still fetches fresh', async () => {
    const fetchPage = vi.fn(page);
    const first = render(<Harness fetch={fetchPage} cacheKey="home:patches.test:50051:1" />);
    await vi.waitFor(() => expect(first.lastFrame()).toContain('loading:false'));
    first.unmount();

    fetchPage.mockClear();
    const second = render(<Harness fetch={fetchPage} cacheKey="home:patches.test:50051:2" />);
    expect(second.lastFrame()).toContain('loading:true');
    await vi.waitFor(() => expect(second.lastFrame()).toContain('loading:false'));
    expect(fetchPage).toHaveBeenCalledOnce();
    second.unmount();
  });
});
