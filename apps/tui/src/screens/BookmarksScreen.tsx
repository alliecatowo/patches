import { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface BookmarksScreenProps {
  api: PatchesApi;
  /** Whether this screen currently owns keyboard input (spec §69: `g b`). */
  isActive: boolean;
  /** Resolves a fresh access token — `App` requires a session before navigating
   * here; bookmarks are private, never another actor's (spec §53). */
  ensureAccessToken: () => Promise<string>;
  actions: PostRowActions;
  /** Bumped by `App` after a successful post — re-reads this list from the server. */
  refreshKey?: number;
}

/** `g b` — the caller's own bookmarked posts, most-recent first (spec §52 MVP note, §53). */
export function BookmarksScreen({
  api,
  isActive,
  ensureAccessToken,
  actions,
  refreshKey = 0,
}: BookmarksScreenProps): ReactElement {
  const fetchPage = useCallback(
    (cursor: string): Promise<PostPage> =>
      ensureAccessToken()
        .then((accessToken) => api.listBookmarks({ cursor, limit: 20 }, accessToken))
        .then((response) => ({ posts: response.posts, page: response.page })),
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
      <Text color={theme.accent}>Bookmarks</Text>
      {error === undefined ? null : <Text color={theme.error}>{error.title}</Text>}
      <Box marginTop={1}>
        <PostList
          posts={posts}
          loading={loading || loadingMore || refreshing}
          newCount={newCount}
          hasMore={hasMore}
          emptyMessage="No bookmarks yet — b on a post to save it here."
          loadMoreKeyHint="n / space"
          isActive={isActive}
          {...actions}
        />
      </Box>
    </Box>
  );
}
