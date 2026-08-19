import { present } from '../api/present.js';
import type { Post } from '@patches/proto';
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

type FocusState =
  | { status: 'loading' }
  | { status: 'ready'; post: Post; parent: Post | undefined }
  | { status: 'error'; error: FriendlyError };

/**
 * One post's thread (spec §24, §51, §69, P4-004): the focused post, its immediate
 * parent for context when it is itself a reply, and its direct replies. `ListReplies`
 * only ever returns one level (`apps/server/.../post.controller.ts`'s `listReplies`
 * comment: `max_depth` is accepted but not yet honoured server-side) — drilling into a
 * reply's own replies opens a *new* `ThreadScreen` for it (`actions.onOpenPost` here is
 * wired by `App` to push onto `threadStack`, never to a client-side recursive fetch;
 * spec §24: "do not load an arbitrarily large thread in one request").
 *
 * The focused post and its replies share one `PostList` (rather than a separate
 * always-on "reply to the focused post" hotkey) so `j`/`k`/`r`/`p`/`l`/`b` all operate
 * on whichever row is selected, focused post included, with no `r`-fires-twice
 * ambiguity between two independent `useInput` hooks.
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

  useEffect(() => {
    let cancelled = false;
    const withToken = async (): Promise<string | undefined> =>
      ensureAccessToken === undefined ? undefined : ensureAccessToken();
    withToken()
      .then(async (accessToken) => api.getPost({ id: postId }, accessToken))
      .then(async (response) => {
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
        if (post.inReplyToId === '') {
          setFocus({ postId, state: { status: 'ready', post, parent: undefined } });
          return;
        }
        // Immediate-parent context only ("if cheap" — one extra `GetPost`, never a walk
        // to the root). A deleted/unreachable parent still shows the focused post.
        try {
          const parentToken = await withToken();
          const parentResponse = await api.getPost({ id: post.inReplyToId }, parentToken);
          if (cancelled) return;
          setFocus({
            postId,
            state: { status: 'ready', post, parent: parentResponse.post ?? undefined },
          });
        } catch {
          if (!cancelled) setFocus({ postId, state: { status: 'ready', post, parent: undefined } });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFocus({
            postId,
            state: { status: 'error', error: describeGrpcError(error, api.target) },
          });
        }
      });
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

  // No `Esc` handler here on purpose: `App`'s navigation stack owns going back from
  // *every* screen, so a thread pops exactly one level like everything else.
  useInput(
    (input) => {
      if ((input === 'n' || input === ' ') && hasMore) {
        loadMore();
        return;
      }
      if (input === 'R') refresh();
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

  const { post, parent } = focusState;
  // The parent (when this post is itself a reply), the focused post and its direct
  // replies are ONE navigable list, in that order (owner feedback 2026-08-18: "in a
  // thread I can't arrow up to reply to the parent of the post I'm looking at").
  // Rendering the parent outside the list is what made it unreachable — every row
  // `j`/`k`/`↑`/`↓` can land on is a row `r`/`l`/`b`/`p` acts on.
  const rows: readonly Post[] =
    parent === undefined ? [post, ...replies] : [parent, post, ...replies];
  const parentId = parent?.id;
  const indentFor = (row: Post): number => {
    if (parentId !== undefined && row.id === parentId) return 0;
    if (row.id === post.id) return parentId === undefined ? 0 : 1;
    return parentId === undefined ? 1 : 2;
  };

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Thread</Text>
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
          {...actions}
          onOpenPost={(row) => {
            // Re-opening the row already in focus would just push a duplicate
            // navigation frame — a no-op is friendlier than a redundant one.
            // `Enter` on the parent or on a reply re-roots the thread there.
            if (row.id !== post.id) actions.onOpenPost?.(row);
          }}
        />
      </Box>
    </Box>
  );
}
