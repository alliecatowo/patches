import { present } from '../api/present.js';
import type { Post } from '../api/wire/types.js';
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { Loading } from '../components/Loading.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface ThreadScreenProps {
  api: PatchesApi;
  /** The post this thread is focused on — `App`'s `threadStack` top. */
  postId: string;
  isActive: boolean;
  actions: PostRowActions;
  /** Present only while signed in — without it the server has no viewer and the
   * focused post and its replies come back with empty `viewer_state`. */
  ensureAccessToken?: (() => Promise<string>) | undefined;
  /** Bumped by `App` after a successful post — changes this screen's `fetch`
   * identity so the focused post and its replies are re-read (a reply you just
   * sent has to appear without leaving and re-entering the thread). */
  refreshKey?: number;
}

/** Bounded ancestor walk (spec §24: "do not load an arbitrarily large thread in one
 * request") — a handful of `GetPost` hops up `inReplyToId`, never a full root walk. */
const MAX_ANCESTORS = 8;

type FocusState =
  | { status: 'loading' }
  | { status: 'ready'; post: Post; ancestors: Post[] }
  | { status: 'error'; error: FriendlyError };

/**
 * One post's thread (spec §24, §51, §69, P4-004): the focused post, its ancestor chain
 * up to `MAX_ANCESTORS` hops for context when it is itself a reply, and its direct
 * replies. `ListReplies` only ever returns one level (`apps/server/.../post.controller.ts`'s
 * `listReplies` comment: `max_depth` is accepted but not yet honoured server-side) —
 * drilling into a reply's own replies opens a *new* `ThreadScreen` for it
 * (`actions.onOpenPost` here is wired by `App` to push onto `threadStack`, never to a
 * client-side recursive fetch).
 *
 * Beyond the immediate parent the ancestor chain collapses by default (`a` toggles) —
 * a deep thread's full lineage is context, not the point of the screen, and printing it
 * unconditionally would bury the focused post and its replies below the fold (spec §154
 * "flagship surface": clear hierarchy over exhaustive recall).
 *
 * The ancestor chain, the focused post and its replies share one `PostList` (rather
 * than a separate always-on "reply to the focused post" hotkey) so `j`/`k`/`r`/`p`/`l`/`b`
 * all operate on whichever row is selected, with no `r`-fires-twice ambiguity between
 * two independent `useInput` hooks.
 */
export function ThreadScreen({
  api,
  postId,
  isActive,
  actions,
  ensureAccessToken,
  refreshKey = 0,
}: ThreadScreenProps): ReactElement {
  const [focus, setFocus] = useState<{ postId: string; state: FocusState } | undefined>();
  const focusState: FocusState = (focus?.postId === postId ? focus.state : undefined) ?? {
    status: 'loading',
  };
  // Collapsed by default whenever there's more than one ancestor to hide — the
  // immediate parent alone is still shown either way (below). Keyed by `postId`
  // (like `focus` above) rather than reset via a synchronous effect setState —
  // it just naturally reads as "not expanded" once `postId` moves on.
  const [ancestorsExpandedFor, setAncestorsExpandedFor] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const withToken = async (): Promise<string | undefined> =>
      ensureAccessToken === undefined ? undefined : ensureAccessToken();
    async function run(): Promise<void> {
      try {
        const accessToken = await withToken();
        const response = await api.getPost({ id: postId }, accessToken);
        if (cancelled) return;
        if (!present(response.post)) {
          setFocus({
            postId,
            state: {
              status: 'error',
              error: { title: 'That post no longer exists.', hint: '', retryable: false, code: 5 },
            },
          });
          return;
        }
        const post = response.post;
        // Ancestor chain, oldest first, capped at `MAX_ANCESTORS` hops. A deleted,
        // unreachable, or cyclic (should never happen, but a fetched id repeating
        // would otherwise spin forever) ancestor just stops the walk early — the
        // focused post and whatever was already collected still render.
        const ancestors: Post[] = [];
        const seen = new Set<string>([post.id]);
        let cursor = post.inReplyToId;
        while (cursor !== '' && ancestors.length < MAX_ANCESTORS) {
          if (seen.has(cursor)) break;
          seen.add(cursor);
          try {
            const ancestorToken = await withToken();
            const ancestorResponse = await api.getPost({ id: cursor }, ancestorToken);
            if (cancelled) return;
            if (!present(ancestorResponse.post)) break;
            ancestors.unshift(ancestorResponse.post);
            cursor = ancestorResponse.post.inReplyToId;
          } catch {
            break;
          }
        }
        if (!cancelled) setFocus({ postId, state: { status: 'ready', post, ancestors } });
      } catch (error) {
        if (!cancelled) {
          setFocus({
            postId,
            state: { status: 'error', error: describeGrpcError(error, api.target) },
          });
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [api, postId, ensureAccessToken, refreshKey]);

  const fetchReplies = useCallback(
    async (cursor: string): Promise<PostPage> => {
      const accessToken = ensureAccessToken === undefined ? undefined : await ensureAccessToken();
      const response = await api.listReplies(
        { postId, cursor, limit: 20, maxDepth: 1 },
        accessToken,
      );
      return { posts: response.posts, page: response.page };
    },
    // `refreshKey` is a deliberate cache-buster, not a value this callback reads:
    // changing its identity is exactly how `usePaginatedList` is told to re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [api, postId, ensureAccessToken, refreshKey],
  );
  const {
    posts: replies,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    refreshing,
  } = usePaginatedPosts(api.target, fetchReplies);

  const ancestors = focusState.status === 'ready' ? focusState.ancestors : [];

  // No `Esc` handler here on purpose: `App`'s navigation stack owns going back from
  // *every* screen, so a thread pops exactly one level like everything else.
  useInput(
    (input) => {
      if ((input === 'n' || input === ' ') && hasMore) {
        loadMore();
        return;
      }
      if (input === 'R') refresh();
      if (input === 'a' && ancestors.length > 1) {
        setAncestorsExpandedFor((current) => (current === postId ? undefined : postId));
      }
    },
    { isActive },
  );

  if (focusState.status === 'loading') {
    return (
      <Box>
        <Loading label="Loading thread" />
      </Box>
    );
  }

  if (focusState.status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color={theme.error}>{focusState.error.title}</Text>
        <Text color={theme.muted}>Esc back</Text>
      </Box>
    );
  }

  const { post } = focusState;
  const ancestorsExpanded = ancestorsExpandedFor === postId;
  // Ancestor chain (oldest first). Collapsed, only the immediate parent (the last
  // entry) is shown; expanded, the whole capped chain is. Either way at least the
  // immediate parent stays visible — that's the context a reply needs most.
  const hiddenAncestorCount = ancestorsExpanded || ancestors.length <= 1 ? 0 : ancestors.length - 1;
  const visibleAncestors = hiddenAncestorCount > 0 ? ancestors.slice(-1) : ancestors;
  // The visible ancestor chain, the focused post and its direct replies are ONE
  // navigable list, in that order (owner feedback 2026-08-18: "in a thread I can't
  // arrow up to reply to the parent of the post I'm looking at"). Rendering the
  // parent outside the list is what made it unreachable — every row `j`/`k`/`↑`/`↓`
  // can land on is a row `r`/`l`/`b`/`p` acts on.
  const rows: readonly Post[] = [...visibleAncestors, post, ...replies];
  const hasAncestors = visibleAncestors.length > 0;
  const indentFor = (row: Post): number => {
    if (visibleAncestors.some((ancestor) => ancestor.id === row.id)) return 0;
    if (row.id === post.id) return hasAncestors ? 1 : 0;
    return hasAncestors ? 2 : 1;
  };

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Thread</Text>
      {hiddenAncestorCount > 0 ? (
        <Text color={theme.muted}>
          ↑ {hiddenAncestorCount} earlier {hiddenAncestorCount === 1 ? 'post' : 'posts'} in this
          thread · a to expand
        </Text>
      ) : null}
      {ancestorsExpanded && ancestors.length > 1 ? (
        <Text color={theme.muted}>a to collapse ancestor chain</Text>
      ) : null}
      {error === undefined ? null : (
        <Box marginTop={1}>
          <Text color={theme.error}>{error.title}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <PostList
          posts={rows}
          loading={loading || loadingMore || refreshing}
          hasMore={hasMore}
          emptyMessage="No replies yet."
          loadMoreKeyHint="n / space"
          isActive={isActive}
          rowIndent={indentFor}
          chromeRows={
            hiddenAncestorCount > 0 || (ancestorsExpanded && ancestors.length > 1) ? 3 : 2
          }
          {...actions}
          onOpenPost={(row) => {
            // Re-opening the row already in focus would just push a duplicate
            // navigation frame — a no-op is friendlier than a redundant one.
            // `Enter` on any ancestor or reply re-roots the thread there.
            if (row.id !== post.id) actions.onOpenPost?.(row);
          }}
        />
      </Box>
    </Box>
  );
}
