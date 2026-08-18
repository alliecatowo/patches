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
}

/** `g b` — the caller's own bookmarked posts, most-recent first (spec §52 MVP note, §53). */
export function BookmarksScreen({
  api,
  isActive,
  ensureAccessToken,
  actions,
}: BookmarksScreenProps): ReactElement {
  const fetchPage = useCallback(
    (cursor: string): Promise<PostPage> =>
      ensureAccessToken()
        .then((accessToken) => api.listBookmarks({ cursor, limit: 20 }, accessToken))
        .then((response) => ({ posts: response.posts, page: response.page })),
    [api, ensureAccessToken],
  );
  const { posts, loading, loadingMore, hasMore, error, loadMore } = usePaginatedPosts(
    api.target,
    fetchPage,
  );

  useInput(
    (input) => {
      if ((input === 'n' || input === ' ') && hasMore) loadMore();
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
          loading={loading || loadingMore}
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
