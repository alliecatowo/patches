import type { Post } from '@patches/proto';
import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { theme } from '../theme/index.js';
import { PostRow } from './PostRow.js';

export interface PostListProps {
  posts: readonly Post[];
  /** Shown while the initial page or a `loadMore` call is in flight. */
  loading: boolean;
  /** `page.hasMore` from the last response (spec §46 — keyset cursor, never offset). */
  hasMore: boolean;
  /** Shown once `posts` is empty and nothing is loading. */
  emptyMessage: string;
  /** The keys that trigger `loadMore` in the owning screen, for the footer hint. */
  loadMoreKeyHint?: string;
}

/**
 * The chronological post list shared by the profile timeline and the local
 * feed (spec §68: shared components, not one screen per list). Cursor-based
 * "load more" is driven by the owning screen's `useInput` — this component
 * only renders what it is given.
 */
export function PostList({
  posts,
  loading,
  hasMore,
  emptyMessage,
  loadMoreKeyHint = 'n',
}: PostListProps): ReactElement {
  if (posts.length === 0) {
    return (
      <Box>
        <Text color={theme.muted}>{loading ? 'Loading…' : emptyMessage}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {posts.map((post) => (
        <PostRow key={post.id} post={post} />
      ))}
      <Text color={theme.muted}>
        {loading
          ? 'Loading more…'
          : hasMore
            ? `${loadMoreKeyHint} for more`
            : '— end of the timeline —'}
      </Text>
    </Box>
  );
}
