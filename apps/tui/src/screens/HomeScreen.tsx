import { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface HomeScreenProps {
  api: PatchesApi;
  /** Whether this screen currently owns keyboard input (spec §69: `g h`). */
  isActive: boolean;
  /** Resolves a fresh access token, refreshing first if needed — `App` requires a
   * session before navigating here (`ListHomeFeed` needs one). */
  ensureAccessToken: () => Promise<string>;
  actions: PostRowActions;
  /** Bumped by `App` after a successful post — re-reads this list from the server. */
  refreshKey?: number;
}

/**
 * `g h` — the caller's home timeline: their own posts plus everyone they follow,
 * chronological, fan-out-on-read (spec §52, §137). Requires a session (`App` gates
 * navigation the same way it gates `c`/own `g p`).
 */
export function HomeScreen({
  api,
  isActive,
  ensureAccessToken,
  actions,
  refreshKey = 0,
}: HomeScreenProps): ReactElement {
  const fetchPage = useCallback(
    (cursor: string): Promise<PostPage> =>
      ensureAccessToken()
        .then((accessToken) => api.listHomeFeed({ cursor, limit: 20 }, accessToken))
        .then((response) => ({ posts: response.posts, page: response.page })),
    // `refreshKey` is a deliberate cache-buster, not a value this callback reads:
    // changing its identity is exactly how `usePaginatedList` is told to re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [api, ensureAccessToken, refreshKey],
  );
  // B-043: a stable cache key lets a second mount of this screen (the palette
  // overlay's frozen background snapshot, `components/Overlay.tsx`) render the
  // already-loaded page instead of flashing "Loading" behind the palette.
  const { posts, loading, loadingMore, hasMore, error, loadMore, refresh, refreshing, newCount } =
    usePaginatedPosts(api.target, fetchPage, `home:${api.target}:${String(refreshKey)}`);

  useInput(
    (input) => {
      if ((input === 'n' || input === ' ') && hasMore) {
        loadMore();
        return;
      }
      // `R` re-reads page one from the server: the `↑ N new` marker, and — the
      // reason it matters — fresh `viewer_state`, so likes made in an earlier
      // session stop looking un-liked.
      if (input === 'R') refresh();
    },
    { isActive: isActive && !loading },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Home</Text>
      {error === undefined ? null : <Text color={theme.error}>{error.title}</Text>}
      <Box marginTop={1}>
        <PostList
          posts={posts}
          loading={loading || loadingMore || refreshing}
          newCount={newCount}
          hasMore={hasMore}
          emptyMessage="Nobody you follow has posted yet — try Local (g l) or search (/)."
          loadMoreKeyHint="n / space"
          isActive={isActive}
          {...actions}
        />
      </Box>
    </Box>
  );
}
