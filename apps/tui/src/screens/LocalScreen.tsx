import { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { PostList } from '../components/PostList.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface LocalScreenProps {
  api: PatchesApi;
  /** Whether this screen currently owns keyboard input (spec §69: `g l`). */
  isActive: boolean;
}

/** All local public posts, newest first — `g l` (spec §52, §69). */
export function LocalScreen({ api, isActive }: LocalScreenProps): ReactElement {
  const fetchPage = useCallback(
    (cursor: string): Promise<PostPage> =>
      api.listLocalFeed({ cursor, limit: 20 }).then((response) => ({
        posts: response.posts,
        page: response.page,
      })),
    [api],
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
      <Text color={theme.accent}>Local</Text>
      {error === undefined ? null : <Text color={theme.error}>{error.title}</Text>}
      <Box marginTop={1}>
        <PostList
          posts={posts}
          loading={loading || loadingMore}
          hasMore={hasMore}
          emptyMessage="No local posts yet."
          loadMoreKeyHint="n / space"
        />
      </Box>
    </Box>
  );
}
