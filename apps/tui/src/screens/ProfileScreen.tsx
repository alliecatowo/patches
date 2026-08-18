import { present } from '../api/present.js';
import { FOLLOW_STATE, type Actor, type Relationship } from '@patches/proto';
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { Nameplate } from '../components/Nameplate.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { useActor } from '../hooks/useActor.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';

export interface ProfileScreenProps {
  api: PatchesApi;
  actorId: string;
  /** Already-known full profile (e.g. the caller's own, from `ActiveSession.actor`) — skips a `GetActor` round trip. */
  knownActor?: Actor | undefined;
  isActive: boolean;
  actions: PostRowActions;
  /** The signed-in viewer's own actor id — omitted (or equal to `actorId`) hides the
   * follow control (spec §50: there is nothing to follow on your own profile). */
  viewerActorId?: string | undefined;
  /** Resolves a fresh access token — only needed when `viewerActorId` is set. */
  ensureAccessToken?: (() => Promise<string>) | undefined;
  /** `!` — opens the report screen scoped to this actor (spec §55). */
  onReportActor?: ((actor: Actor) => void) | undefined;
}

type FollowUi =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'ready'; relationship: Relationship }
  | { status: 'error'; error: FriendlyError };

type ModerationAction = 'block' | 'mute';

/**
 * An actor's profile header plus their post timeline (spec §68–69: `g p` for
 * the caller's own profile; also reachable from a post's author), and — when
 * viewing someone else while signed in — a follow/unfollow control (`f`) plus
 * moderation (`B` block/unblock, `M` mute/unmute, each behind a `y`/`n`
 * confirm — spec §55, §61–64, P4-004).
 */
export function ProfileScreen({
  api,
  actorId,
  knownActor,
  isActive,
  actions,
  viewerActorId,
  ensureAccessToken,
  onReportActor,
}: ProfileScreenProps): ReactElement {
  const actorState = useActor(api, actorId, knownActor);
  const canFollow =
    viewerActorId !== undefined && viewerActorId !== actorId && ensureAccessToken !== undefined;

  // Keyed by `actorId` and derived (not written synchronously by the effect below)
  // for the same reason `useActor` derives its own "loading" — never
  // `setState`-in-effect purely to produce a value already computable from props
  // (react-hooks/set-state-in-effect). `LOADING`/`UNAVAILABLE` fall out of the
  // derivation whenever there is no matching stored outcome yet.
  const [outcome, setOutcome] = useState<{ actorId: string; state: FollowUi } | undefined>();
  const followUi: FollowUi = !canFollow
    ? { status: 'unavailable' }
    : ((outcome?.actorId === actorId ? outcome.state : undefined) ?? { status: 'loading' });

  useEffect(() => {
    if (!canFollow || ensureAccessToken === undefined) return;
    let cancelled = false;
    ensureAccessToken()
      .then((accessToken) => api.getRelationship({ actorId }, accessToken))
      .then((response) => {
        if (cancelled) return;
        if (present(response.relationship)) {
          setOutcome({ actorId, state: { status: 'ready', relationship: response.relationship } });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOutcome({
            actorId,
            state: { status: 'error', error: describeGrpcError(error, api.target) },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, actorId, canFollow, ensureAccessToken]);

  // Not an effect — a direct response to `f`, so setting "loading" optimistically
  // here is a normal event-handler state update, not the effect anti-pattern above.
  async function toggleFollow(): Promise<void> {
    if (followUi.status !== 'ready' || ensureAccessToken === undefined) return;
    const following = followUi.relationship.state === FOLLOW_STATE.FOLLOWING;
    setOutcome({ actorId, state: { status: 'loading' } });
    try {
      const accessToken = await ensureAccessToken();
      const response = following
        ? await api.unfollowActor({ actorId }, accessToken)
        : await api.followActor({ actorId }, accessToken);
      if (present(response.relationship)) {
        setOutcome({ actorId, state: { status: 'ready', relationship: response.relationship } });
      }
    } catch (error) {
      setOutcome({
        actorId,
        state: { status: 'error', error: describeGrpcError(error, api.target) },
      });
    }
  }

  // `undefined` when no `B`/`M` confirmation is pending.
  const [confirmAction, setConfirmAction] = useState<ModerationAction | undefined>(undefined);

  // Not an effect either, same reasoning as `toggleFollow` — a direct response to `y`.
  async function performModeration(action: ModerationAction): Promise<void> {
    if (followUi.status !== 'ready' || ensureAccessToken === undefined) return;
    const { blocking, muting } = followUi.relationship;
    setOutcome({ actorId, state: { status: 'loading' } });
    try {
      const accessToken = await ensureAccessToken();
      const response =
        action === 'block'
          ? blocking
            ? await api.unblockActor({ actorId }, accessToken)
            : await api.blockActor({ actorId }, accessToken)
          : muting
            ? await api.unmuteActor({ actorId }, accessToken)
            : await api.muteActor({ actorId }, accessToken);
      if (present(response.relationship)) {
        setOutcome({ actorId, state: { status: 'ready', relationship: response.relationship } });
      }
    } catch (error) {
      setOutcome({
        actorId,
        state: { status: 'error', error: describeGrpcError(error, api.target) },
      });
    }
  }

  useInput(
    (input) => {
      if (confirmAction !== undefined) return;
      if (input === 'f') {
        void toggleFollow();
        return;
      }
      if (input === 'B' && followUi.status === 'ready') {
        setConfirmAction('block');
        return;
      }
      if (input === 'M' && followUi.status === 'ready') {
        setConfirmAction('mute');
        return;
      }
      if (input === '!' && actorState.status === 'ready') {
        onReportActor?.(actorState.actor);
      }
    },
    { isActive: isActive && actorState.status === 'ready' },
  );

  useInput(
    (input, key) => {
      if (confirmAction === undefined) return;
      if (input === 'y') {
        void performModeration(confirmAction);
        setConfirmAction(undefined);
        return;
      }
      if (input === 'n' || key.escape) setConfirmAction(undefined);
    },
    { isActive: isActive && confirmAction !== undefined },
  );

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
        {actor.displayName === '' ? `@${actor.handle}` : sanitizeForTerminal(actor.displayName)}
      </Text>
      <Nameplate handle={actor.handle} nameplate={actor.nameplate ?? undefined} />
      {present(actor.nameplate) && actor.nameplate.statusLine !== '' ? (
        <Text color={theme.muted} wrap="wrap">
          {sanitizeForTerminal(actor.nameplate.statusLine)}
        </Text>
      ) : null}
      {present(actor.nameplate) && actor.nameplate.badges.length > 0 ? (
        <Text color={theme.accent}>
          {actor.nameplate.badges.map((badge) => `[${sanitizeForTerminal(badge)}]`).join(' ')}
        </Text>
      ) : null}
      {actor.bio === '' ? null : <Text wrap="wrap">{sanitizeForTerminal(actor.bio)}</Text>}
      {present(counts) ? (
        <Text color={theme.muted}>
          {counts.posts} posts · {counts.followers} followers · {counts.following} following
        </Text>
      ) : null}
      {followUi.status === 'ready' ? (
        <Text color={theme.muted}>
          {followUi.relationship.state === FOLLOW_STATE.FOLLOWING ? 'following' : 'not following'}
          {followUi.relationship.followedBy ? ' · follows you' : ''}
          {'  ·  f to '}
          {followUi.relationship.state === FOLLOW_STATE.FOLLOWING ? 'unfollow' : 'follow'}
          {'  ·  B to '}
          {followUi.relationship.blocking ? 'unblock' : 'block'}
          {'  ·  M to '}
          {followUi.relationship.muting ? 'unmute' : 'mute'}
        </Text>
      ) : null}
      {followUi.status === 'error' ? <Text color={theme.error}>{followUi.error.title}</Text> : null}
      {confirmAction !== undefined && followUi.status === 'ready' ? (
        <Text color={theme.warn}>
          {confirmAction === 'block'
            ? followUi.relationship.blocking
              ? 'Unblock'
              : 'Block'
            : followUi.relationship.muting
              ? 'Unmute'
              : 'Mute'}{' '}
          @{sanitizeForTerminal(actor.handle)}? y/n
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
          isActive={isActive}
          {...actions}
        />
      </Box>
    </Box>
  );
}
