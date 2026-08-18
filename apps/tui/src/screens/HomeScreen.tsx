import { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';
import type { Post } from '@patches/proto';

import type { PatchesApi } from '../api/client.js';
import { PostList } from '../components/PostList.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface HomeScreenProps {
  api: PatchesApi;
  /** Whether this screen currently owns keyboard input (spec §69: `g h`). */
  isActive: boolean;
  /** Resolves a fresh access token, refreshing first if needed — `App` requires a
   * session before navigating here (`ListHomeFeed` needs one). */
  ensureAccessToken: () => Promise<string>;
  /** `Enter` on a selected post — opens the author's profile (B-017). */
  onOpenAuthor?: ((post: Post) => void) | undefined;
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
  onOpenAuthor,
}: HomeScreenProps): ReactElement {
  const fetchPage = useCallback(
    (cursor: string): Promise<PostPage> =>
      ensureAccessToken()
        .then((accessToken) => api.listHomeFeed({ cursor, limit: 20 }, accessToken))
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
      <Text color={theme.accent}>Home</Text>
      {error === undefined ? null : <Text color={theme.error}>{error.title}</Text>}
      <Box marginTop={1}>
        <PostList
          posts={posts}
          loading={loading || loadingMore}
          hasMore={hasMore}
          emptyMessage="Nobody you follow has posted yet — try Local (g l) or search (/)."
          loadMoreKeyHint="n / space"
          isActive={isActive}
          onOpenAuthor={onOpenAuthor}
        />
      </Box>
    </Box>
  );
}
