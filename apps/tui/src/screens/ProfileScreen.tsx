import { present } from '../api/present.js';
import type { Actor } from '@patches/proto';
import { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { PostList } from '../components/PostList.js';
import { useActor } from '../hooks/useActor.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface ProfileScreenProps {
  api: PatchesApi;
  actorId: string;
  /** Already-known full profile (e.g. the caller's own, from `ActiveSession.actor`) — skips a `GetActor` round trip. */
  knownActor?: Actor | undefined;
  isActive: boolean;
}

/**
 * An actor's profile header plus their post timeline (spec §68–69: `g p` for
 * the caller's own profile; also reachable from a post's author).
 *
 * `Actor` has no `nameplate` field yet in `packages/proto` (Amendment A, §173
 * — landed in the spec after this schema; owned by another workstream in this
 * change) so there is nothing to render there — see the implementer report.
 */
export function ProfileScreen({
  api,
  actorId,
  knownActor,
  isActive,
}: ProfileScreenProps): ReactElement {
  const actorState = useActor(api, actorId, knownActor);

  const fetchPage = useCallback(
    (cursor: string): Promise<PostPage> =>
      api.listActorPosts({ actorId, cursor, limit: 20 }).then((response) => ({
        posts: response.posts,
        page: response.page,
      })),
    [api, actorId],
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

  if (actorState.status === 'loading') {
    return (
      <Box>
        <Text color={theme.muted}>Loading profile…</Text>
      </Box>
    );
  }

  if (actorState.status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color={theme.error}>{actorState.error.title}</Text>
      </Box>
    );
  }

  const { actor } = actorState;
  const counts = actor.counts;

  return (
    <Box flexDirection="column">
      <Text color={theme.accent} bold>
        {actor.displayName === '' ? `@${actor.handle}` : actor.displayName}
      </Text>
      <Text color={theme.muted}>@{actor.handle}</Text>
      {actor.bio === '' ? null : <Text wrap="wrap">{actor.bio}</Text>}
      {present(counts) ? (
        <Text color={theme.muted}>
          {counts.posts} posts · {counts.followers} followers · {counts.following} following
        </Text>
      ) : null}

      {error === undefined ? null : (
        <Box marginTop={1}>
          <Text color={theme.error}>{error.title}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <PostList
          posts={posts}
          loading={loading || loadingMore}
          hasMore={hasMore}
          emptyMessage="No posts yet."
          loadMoreKeyHint="n / space"
        />
      </Box>
    </Box>
  );
}
