import type { Post } from '@patches/proto';
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import type { ReactElement } from 'react';

import { useContentSize } from '../app/layout.js';
import { movementTarget, type ListJump } from '../app/list-movement.js';
import { theme } from '../theme/index.js';
import { computeViewport, resolveTopIndex } from './list-viewport.js';
import { Loading } from './Loading.js';
import { measurePostRowHeight } from './post-height.js';
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
  /** `f` on the selected row — follows/unfollows its author without leaving the
   * timeline (owner feedback 2026-08-18: follows existed but only on a profile). */
  onToggleFollow?: ((post: Post) => void) | undefined;
  /** `R` — repost/unrepost. Refresh is `Ctrl+R` in keymap v2. */
  onToggleRepost?: ((post: Post) => void) | undefined;
  /** `Q` — start a quote-post draft pointing at this post. */
  onQuote?: ((post: Post) => void) | undefined;
  /** `e` — edit one of the viewer's own posts. */
  onEdit?: ((post: Post) => void) | undefined;
  /** `d` — request deletion; the shell must show a confirm dialog. */
  onDelete?: ((post: Post) => void) | undefined;
  /** `H` — open the immutable edit history for this post. */
  onHistory?: ((post: Post) => void) | undefined;
  /** `I` — pin/unpin one of the viewer's own profile posts. */
  onTogglePin?: ((post: Post) => void) | undefined;
  /** Not an action: `g g` (top) arrives from the shell, because `g` is the shell's
   * key prefix. Threaded through the same bag every screen already spreads onto
   * `PostList`, so no screen needs a new prop. */
  jump?: ListJump | undefined;
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
  /** How many posts a `R` refresh just brought in that weren't there before —
   * renders the `↑ N new` marker above the list. `0` renders nothing. */
  newCount?: number;
  /** Rows the owning screen spends on its own chrome (title, margin, error line,
   * profile header) before the list starts. Subtracted from the content budget. */
  chromeRows?: number;
}

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
  onToggleFollow,
  onToggleRepost,
  onQuote,
  onEdit,
  onDelete,
  onHistory,
  onTogglePin,
  jump,
  rowIndent,
  decorate,
  newCount = 0,
  chromeRows = 2,
}: PostListProps): ReactElement {
  const content = useContentSize();
  // The applied jump nonce travels with the selection so a `g g` can be *derived*
  // during render instead of written back from an effect (the same rule the rest of
  // this codebase follows — no setState-in-effect just to compute a value).
  const [selection, setSelection] = useState<{ index: number; jumpNonce: number; top: number }>({
    index: 0,
    jumpNonce: 0,
    top: 0,
  });
  // Which `content_warning`-gated posts the viewer has revealed this session — never
  // persisted, never shared across posts (spec: a CW is click-to-reveal per post).
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Derived rather than clamped via an effect (react-hooks/set-state-in-effect,
  // and the same "no synchronous setState-in-effect" pattern as `useActor`):
  // in bounds even right after the list shrinks/grows, with nothing to write back.
  const maxIndex = Math.max(posts.length - 1, 0);
  const pendingJump = jump !== undefined && jump.nonce !== selection.jumpNonce ? jump : undefined;
  const effectiveSelected =
    pendingJump === undefined
      ? Math.min(selection.index, maxIndex)
      : pendingJump.edge === 'top'
        ? 0
        : maxIndex;

  function select(index: number): void {
    setSelection({ index, jumpNonce: jump?.nonce ?? 0, top: topIndex });
  }

  // Measured layout: every row's exact height at the real width, so the window can
  // never render more rows than the shell budgeted for it.
  const width = Math.max(10, content.columns - 4);
  // Two rows of the list's own budget go to the position line and the loading line.
  const budget = Math.max(3, content.rows - chromeRows - 2);
  const heights = posts.map((post) =>
    measurePostRowHeight(
      decorate?.(post) ?? post,
      width,
      revealed.has(post.id),
      expanded.has(post.id),
    ),
  );
  const topIndex = resolveTopIndex(selection.top, effectiveSelected, heights, budget);
  const viewport = computeViewport(topIndex, heights, budget);
  const visible = posts.slice(viewport.start, viewport.end);

  useInput(
    (input, key) => {
      if (posts.length === 0) return;
      const moved = movementTarget({
        input,
        key,
        current: effectiveSelected,
        total: posts.length,
        pageSize: Math.max(1, viewport.end - viewport.start),
      });
      if (moved !== undefined) {
        select(moved);
        return;
      }
      if (input === 'v') {
        const post = posts[effectiveSelected];
        if (post !== undefined && post.contentWarning !== '' && !revealed.has(post.id)) {
          setRevealed((current) => {
            const next = new Set(current);
            next.add(post.id);
            return next;
          });
        } else if (post !== undefined) {
          setExpanded((current) => {
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
        return;
      }
      if (input === 'f') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onToggleFollow?.(post);
        return;
      }
      if (input === 'R') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onToggleRepost?.(post);
        return;
      }
      if (input === 'Q') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onQuote?.(post);
        return;
      }
      if (input === 'e') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onEdit?.(post);
        return;
      }
      if (input === 'd') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onDelete?.(post);
        return;
      }
      if (input === 'H') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onHistory?.(post);
        return;
      }
      if (input === 'I') {
        const post = posts[effectiveSelected];
        if (post !== undefined) onTogglePin?.(post);
      }
    },
    // Deliberately *not* `isActive && posts.length > 0`: Ink subscribes a `useInput`
    // in an effect that bails out while `isActive` is false, and a list always renders
    // once empty before its first page arrives. Gating on the post count therefore left
    // a freshly-launched timeline deaf to `j`/`Enter` until some *other* state change
    // flipped the flag back on (reproduced 2026-08-19). The handler's own
    // `posts.length === 0` guard is what keeps an empty list inert.
    { isActive },
  );

  if (posts.length === 0) {
    return (
      <Box>
        {loading ? <Loading label="Loading" /> : <Text color={theme.muted}>{emptyMessage}</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={budget + 2} overflow="hidden">
      <Box flexShrink={0}>
        {newCount > 0 ? (
          <Text color={theme.ok} wrap="truncate-end">
            ↑ {newCount} new {newCount === 1 ? 'post' : 'posts'}{' '}
          </Text>
        ) : null}
        <Text color={theme.muted} wrap="truncate-end">
          {viewport.above > 0 ? `↑ ${String(viewport.above)} above  ` : ''}
          {effectiveSelected + 1}/{posts.length}
          {viewport.below > 0 ? `  ↓ ${String(viewport.below)} below` : ''}
          {hasMore ? ` · ${loadMoreKeyHint} for more` : ' · — end of the timeline —'}
        </Text>
      </Box>
      <Box flexDirection="column" flexShrink={0} height={budget} overflow="hidden">
        {visible.map((post, index) => (
          <Box key={post.id} flexShrink={0} marginLeft={(rowIndent?.(post) ?? 0) * 2}>
            <PostRow
              post={decorate?.(post) ?? post}
              selected={isActive && viewport.start + index === effectiveSelected}
              revealed={revealed.has(post.id)}
              expanded={expanded.has(post.id)}
              width={Math.max(10, width - (rowIndent?.(post) ?? 0) * 2)}
            />
          </Box>
        ))}
      </Box>
      {loading ? <Loading label="Loading more" /> : <Text> </Text>}
    </Box>
  );
}
