import { present } from '../api/present.js';
import type { Post } from '@patches/proto';
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { PostRow } from '../components/PostRow.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface ThreadScreenProps {
  api: PatchesApi;
  /** The post this thread is focused on — `App`'s `threadStack` top. */
  postId: string;
  isActive: boolean;
  actions: PostRowActions;
  /** `Esc` — pops one level of `App`'s thread stack (back to the parent thread, or
   * out of the thread screen entirely once the stack empties). */
  onBack: () => void;
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
  onBack,
}: ThreadScreenProps): ReactElement {
  const [focus, setFocus] = useState<{ postId: string; state: FocusState } | undefined>();
  const focusState: FocusState = (focus?.postId === postId ? focus.state : undefined) ?? {
    status: 'loading',
  };

  useEffect(() => {
    let cancelled = false;
    api
      .getPost({ id: postId })
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
          const parentResponse = await api.getPost({ id: post.inReplyToId });
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
  }, [api, postId]);

  const fetchReplies = useCallback(
    (cursor: string): Promise<PostPage> =>
      api
        .listReplies({ postId, cursor, limit: 20, maxDepth: 1 })
        .then((response) => ({ posts: response.posts, page: response.page })),
    [api, postId],
  );
  const {
    posts: replies,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
  } = usePaginatedPosts(api.target, fetchReplies);

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
        return;
      }
      if ((input === 'n' || input === ' ') && hasMore) loadMore();
    },
    { isActive },
  );

  if (focusState.status === 'loading') {
    return (
      <Box>
        <Text color={theme.muted}>Loading thread…</Text>
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
  // Focused post plus its direct replies share one `PostList` — index 0 is always the
  // focused post, so `rowIndent` can key off `post.id` alone.
  const rows: readonly Post[] = [post, ...replies];

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Thread</Text>
      {parent === undefined ? null : (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.muted}>in reply to</Text>
          <PostRow post={parent} />
        </Box>
      )}
      {error === undefined ? null : (
        <Box marginTop={1}>
          <Text color={theme.error}>{error.title}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <PostList
          posts={rows}
          loading={loading || loadingMore}
          hasMore={hasMore}
          emptyMessage="No replies yet."
          loadMoreKeyHint="n / space"
          isActive={isActive}
          rowIndent={(row) => (row.id === post.id ? 0 : 1)}
          {...actions}
          onOpenPost={(row) => {
            // Re-opening the row already in focus would just push a duplicate onto
            // `threadStack` — a no-op is friendlier than a redundant stack frame.
            if (row.id !== post.id) actions.onOpenPost?.(row);
          }}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>r reply · p author · l like · b bookmark · Esc back</Text>
      </Box>
    </Box>
  );
}
