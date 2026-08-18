import type { Post } from '@patches/proto';
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
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
  /** Whether this list currently owns keyboard input (spec §69: `j`/`k`/`Enter` selection). */
  isActive?: boolean;
  /** `Enter` on the selected row — typically opens the author's profile. */
  onOpenAuthor?: ((post: Post) => void) | undefined;
}

/**
 * The chronological post list shared by the profile timeline, local feed, and
 * home feed (spec §68: shared components, not one screen per list). Cursor-
 * based "load more" is driven by the owning screen's `useInput` — this
 * component owns only row selection (`j`/`k`/arrows, `Enter` — spec §69/B-017).
 */
export function PostList({
  posts,
  loading,
  hasMore,
  emptyMessage,
  loadMoreKeyHint = 'n',
  isActive = false,
  onOpenAuthor,
}: PostListProps): ReactElement {
  const [selected, setSelected] = useState(0);
  // Derived rather than clamped via an effect (react-hooks/set-state-in-effect,
  // and the same "no synchronous setState-in-effect" pattern as `useActor`):
  // in bounds even right after the list shrinks/grows, with nothing to write back.
  const maxIndex = Math.max(posts.length - 1, 0);
  const effectiveSelected = Math.min(selected, maxIndex);

  useInput(
    (input, key) => {
      if (posts.length === 0) return;
      if (input === 'j' || key.downArrow) {
        setSelected(Math.min(effectiveSelected + 1, maxIndex));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setSelected(Math.max(effectiveSelected - 1, 0));
        return;
      }
      if (key.return) {
        const post = posts[effectiveSelected];
        if (post !== undefined) onOpenAuthor?.(post);
      }
    },
    { isActive: isActive && posts.length > 0 },
  );

  if (posts.length === 0) {
    return (
      <Box>
        <Text color={theme.muted}>{loading ? 'Loading…' : emptyMessage}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {posts.map((post, index) => (
        <PostRow key={post.id} post={post} selected={isActive && index === effectiveSelected} />
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
