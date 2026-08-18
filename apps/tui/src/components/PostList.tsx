import type { Post } from '@patches/proto';
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import type { ReactElement } from 'react';

import { theme } from '../theme/index.js';
import { PostRow } from './PostRow.js';

/**
 * The row-level actions `PostList` fires on the selected row — one shared shape so
 * every screen that renders a `PostList` (home, local, profile, thread, bookmarks)
 * declares one `actions: PostRowActions` prop instead of five individually-optional
 * callbacks each.
 */
export interface PostRowActions {
  /** `Enter` on the selected row — opens its thread (P4-004). */
  onOpenPost?: ((post: Post) => void) | undefined;
  /** `p` on the selected row — opens the author's profile (B-017, moved off `Enter` in P4-004). */
  onOpenAuthor?: ((post: Post) => void) | undefined;
  /** `r` on the selected row — opens compose pre-filled as a reply (P4-004). */
  onReply?: ((post: Post) => void) | undefined;
  /** `l` on the selected row — like/unlike (P4-004, optimistic — spec §79). */
  onToggleLike?: ((post: Post) => void) | undefined;
  /** `b` on the selected row — bookmark/unbookmark (P4-004, optimistic — spec §79). */
  onToggleBookmark?: ((post: Post) => void) | undefined;
  /** `!` on the selected row — opens the report screen scoped to that post (spec §55). */
  onReport?: ((post: Post) => void) | undefined;
  /** `o` on the selected row — opens its first attachment externally (spec §76). A
   * no-op when the row has no attachments. */
  onOpenMedia?: ((post: Post) => void) | undefined;
  /** Applied to each post before it's rendered (not before it's passed to a row
   * action) — lets a caller overlay optimistic reaction state (P4-004's
   * `App.decoratePost`) without every screen's own paginated list needing to
   * know about it. */
  decorate?: ((post: Post) => Post) | undefined;
}

export interface PostListProps extends PostRowActions {
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
  /** Per-row indent level (0 = flush left), e.g. the thread screen indenting
   * replies one step deeper than the focused post it lists alongside them. */
  rowIndent?: ((post: Post) => number) | undefined;
}

/**
 * The chronological post list shared by the profile timeline, local feed,
 * home feed, thread replies, and bookmarks (spec §68: shared components, not
 * one screen per list). Cursor-based "load more" is driven by the owning
 * screen's `useInput` — this component owns only row selection and the
 * per-row actions: `j`/`k`/arrows to move, `Enter` opens the thread, `p` the
 * author's profile, `r` replies, `l`/`b` like/bookmark, `!` report (spec §69,
 * P4-004).
 */
export function PostList({
  posts,
  loading,
  hasMore,
  emptyMessage,
  loadMoreKeyHint = 'n',
  isActive = false,
  onOpenPost,
  onOpenAuthor,
  onReply,
  onToggleLike,
  onToggleBookmark,
  onReport,
  onOpenMedia,
  rowIndent,
  decorate,
}: PostListProps): ReactElement {
  const [selected, setSelected] = useState(0);
  // Which `content_warning`-gated posts the viewer has revealed this session — never
  // persisted, never shared across posts (spec: a CW is click-to-reveal per post).
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
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
      if (input === 'v') {
        const post = posts[effectiveSelected];
        if (post !== undefined && post.contentWarning !== '') {
          setRevealed((current) => {
            const next = new Set(current);
            if (next.has(post.id)) next.delete(post.id);
            else next.add(post.id);
            return next;
          });
        }
        return;
      }
      if (key.return) {
        const post = posts[effectiveSelected];
        if (post !== undefined) onOpenPost?.(post);
        return;
      }
      if (input === 'p') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onOpenAuthor?.(post);
        return;
      }
      if (input === 'r') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onReply?.(post);
        return;
      }
      if (input === 'l') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onToggleLike?.(post);
        return;
      }
      if (input === 'b') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onToggleBookmark?.(post);
        return;
      }
      if (input === '!') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onReport?.(post);
        return;
      }
      if (input === 'o') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onOpenMedia?.(post);
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
        <Box key={post.id} marginLeft={(rowIndent?.(post) ?? 0) * 2}>
          <PostRow
            post={decorate?.(post) ?? post}
            selected={isActive && index === effectiveSelected}
            revealed={revealed.has(post.id)}
          />
        </Box>
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
