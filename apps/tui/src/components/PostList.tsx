import type { Post } from '@patches/proto';
import { Box, Text } from 'ink';
import { useState } from 'react';
import type { ReactElement } from 'react';

import { useContentSize } from '../app/layout.js';
import type { ListJump } from '../app/list-movement.js';
import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';
import { Loading } from './Loading.js';
import { measurePostRowHeight } from './post-height.js';
import { PostRow } from './PostRow.js';
import { VirtualList } from './VirtualList.js';

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
  // The viewer's actual mode (P12-128) — quiet measures identically to rich (only
  // plain mode changes body wrapping; quiet just hides other actors' cosmetics), so
  // `usePlainMode()` is the only mode this measurement needs to know.
  const plain = usePlainMode();
  // Which `content_warning`-gated posts the viewer has revealed this session — never
  // persisted, never shared across posts (spec: a CW is click-to-reveal per post).
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const width = Math.max(10, content.columns - 4);
  // Two rows of the list's own budget go to the position line and the loading line.
  const budget = Math.max(3, content.rows - chromeRows - 2);

  function toggle(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  /** Every post key that acts on the selected row. Movement, paging and `Home`/`End`
   * belong to `VirtualList`; this is only the timeline's own verbs. */
  function handleKey(input: string, _key: unknown, post: Post | undefined): boolean {
    if (post === undefined) return false;
    if (input === 'v') {
      if (post.contentWarning !== '' && !revealed.has(post.id)) {
        setRevealed((current) => new Set(current).add(post.id));
      } else {
        setExpanded((current) => toggle(current, post.id));
      }
      return true;
    }
    const action: Record<string, ((target: Post) => void) | undefined> = {
      p: onOpenAuthor,
      r: onReply,
      l: onToggleLike,
      b: onToggleBookmark,
      '!': onReport,
      o: onOpenMedia,
      f: onToggleFollow,
      R: onToggleRepost,
      Q: onQuote,
      E: onEdit,
      d: onDelete,
      H: onHistory,
      I: onTogglePin,
    };
    const handler = action[input];
    if (handler === undefined) return false;
    handler(post);
    return true;
  }

  if (posts.length === 0) {
    return (
      <Box>
        {loading ? <Loading label="Loading" /> : <Text color={theme.muted}>{emptyMessage}</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={budget + 2} overflow="hidden">
      <VirtualList<Post>
        items={posts}
        keyOf={(post) => post.id}
        width={width}
        budget={budget}
        isActive={isActive}
        jump={jump}
        indentOf={(post) => rowIndent?.(post) ?? 0}
        positionSuffix={hasMore ? ` · ${loadMoreKeyHint} for more` : ' · — end of the timeline —'}
        positionPrefix={
          newCount > 0 ? (
            <Text color={theme.ok} wrap="truncate-end">
              ↑ {newCount} new {newCount === 1 ? 'post' : 'posts'}{' '}
            </Text>
          ) : null
        }
        measure={(post, rowWidth) =>
          measurePostRowHeight(
            decorate?.(post) ?? post,
            rowWidth,
            revealed.has(post.id),
            expanded.has(post.id),
            plain,
          )
        }
        renderItem={(post, state) => (
          <PostRow
            post={decorate?.(post) ?? post}
            selected={state.selected}
            revealed={revealed.has(post.id)}
            expanded={expanded.has(post.id)}
            width={Math.max(10, state.width)}
          />
        )}
        onKey={(input, key, post) => {
          if (key.return) {
            if (post !== undefined) onOpenPost?.(post);
            return true;
          }
          return handleKey(input, key, post);
        }}
      />
      {loading ? <Loading label="Loading more" /> : <Text> </Text>}
    </Box>
  );
}
