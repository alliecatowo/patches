import { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface LocalScreenProps {
  api: PatchesApi;
  /** Whether this screen currently owns keyboard input (spec §69: `g l`). */
  isActive: boolean;
  actions: PostRowActions;
  /** Present only while signed in. The local feed is anonymous-readable, but without a
   * token the server has no viewer and every post comes back with empty
   * `viewer_state` — which is what made likes look lost after a new session. */
  ensureAccessToken?: (() => Promise<string>) | undefined;
  /** Bumped by `App` after a successful post — re-reads this list from the server. */
  refreshKey?: number;
}

/** All local public posts, newest first — `g l` (spec §52, §69). */
export function LocalScreen({
  api,
  isActive,
  actions,
  ensureAccessToken,
  refreshKey = 0,
}: LocalScreenProps): ReactElement {
  const fetchPage = useCallback(
    async (cursor: string): Promise<PostPage> => {
      const accessToken = ensureAccessToken === undefined ? undefined : await ensureAccessToken();
      const response = await api.listLocalFeed({ cursor, limit: 20 }, accessToken);
      return { posts: response.posts, page: response.page };
    },
    // `refreshKey` is a deliberate cache-buster, not a value this callback reads:
    // changing its identity is exactly how `usePaginatedList` is told to re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [api, ensureAccessToken, refreshKey],
  );
  const { posts, loading, loadingMore, hasMore, error, loadMore, refresh, refreshing, newCount } =
    usePaginatedPosts(api.target, fetchPage);

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
      <Text color={theme.accent}>Local</Text>
      {error === undefined ? null : <Text color={theme.error}>{error.title}</Text>}
      <Box marginTop={1}>
        <PostList
          posts={posts}
          loading={loading || loadingMore || refreshing}
          newCount={newCount}
          hasMore={hasMore}
          emptyMessage="No local posts yet."
          loadMoreKeyHint="n / space"
          isActive={isActive}
          {...actions}
        />
      </Box>
    </Box>
  );
}
