import { present } from '../api/present.js';
import { FOLLOW_STATE, NAME_TAG_STYLE, PROFILE_FRAME } from '../api/wire/enums.js';
import type { Actor, Relationship } from '../api/wire/types.js';
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import type { ToastKind } from '../components/Toast.js';
import { Nameplate } from '../components/Nameplate.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { useActor } from '../hooks/useActor.js';
import { usePaginatedPosts, type PostPage } from '../hooks/usePaginatedPosts.js';
import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';

/** Ink's own `Box` `borderStyle` values (`cli-boxes`' `Boxes` keys, minus `arrow`) a
 * `Nameplate.profile_border` can select — no defined vocabulary in the proto (spec §173
 * leaves the string free-form, validated against node capabilities at write time), so
 * an unrecognized value still gets a border (falls back to `'round'`) rather than
 * silently rendering none. */
type BorderStyle =
  'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic';
const BORDER_STYLES: readonly BorderStyle[] = [
  'single',
  'double',
  'round',
  'bold',
  'singleDouble',
  'doubleSingle',
  'classic',
];

function borderStyleFor(profileBorder: string): BorderStyle {
  return (BORDER_STYLES as readonly string[]).includes(profileBorder)
    ? (profileBorder as BorderStyle)
    : 'round';
}

/**
 * B-130 rapid personalization: the `ProfileFrame` enum as an Ink border. An explicit frame
 * (BORDER/GLOW/GRADIENT) wins over the older free-text `Nameplate.profile_border` below —
 * the enum is the newer, typed vocabulary; the free string remains for profiles that set
 * it before the enum existed. UNSPECIFIED/NONE (and anything unrecognized) render no frame
 * of this kind (§184.3 degradation).
 */
function frameBorderStyle(frame: PROFILE_FRAME): BorderStyle | undefined {
  switch (frame) {
    case PROFILE_FRAME.BORDER:
      return 'single';
    case PROFILE_FRAME.GLOW:
      return 'double';
    case PROFILE_FRAME.GRADIENT:
      return 'bold';
    default:
      return undefined;
  }
}

/** Name-tag suffix glyphs — one narrow character per style, gated on plain mode at the
 * call site like every other decoration. */
function nameTagGlyph(style: NAME_TAG_STYLE): string {
  switch (style) {
    case NAME_TAG_STYLE.BADGE:
      return '◆';
    case NAME_TAG_STYLE.RIBBON:
      return '»';
    case NAME_TAG_STYLE.PILLED:
      return '◌';
    default:
      return '';
  }
}

/** The banner placeholder is a text description (the TUI does not fetch profile banners):
 * the host, or the raw string if it does not parse as a URL. */
function bannerHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    // Not a parseable URL — describe what was stored rather than dropping the line.
    return sanitizeForTerminal(url);
  }
}

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
  /** `v` — opens this actor's Patches Page (P45-006). */
  onVisitPage?: ((actor: Actor) => void) | undefined;
  /** `e` — only offered on the viewer's own profile (`actorId === viewerActorId`):
   * opens `EditProfileScreen` (A-027). */
  onEditProfile?: ((actor: Actor) => void) | undefined;
  /** `F` — view this actor's followers list. */
  onViewFollowers?: ((actor: Actor) => void) | undefined;
  /** `G` — view this actor's following list. */
  onViewFollowing?: ((actor: Actor) => void) | undefined;
  /**
   * Opens the shell's shared measured `ConfirmDialog` for a destructive action
   * (P12-126). Every destructive path in the app goes through one component; a screen
   * that rolled its own `y/n` line was a second, unmeasured confirm that could disagree
   * with it about wording, height and which key cancels.
   */
  onConfirm?:
    | ((request: { id: string; title: string; body: string; onConfirm: () => void }) => void)
    | undefined;
  /** Bumped by `App` after a successful post — re-reads this list from the server. */
  refreshKey?: number;
  /** Surfaces a toast in the shell — used for "follow request sent" (§197.5: a
   * locked-account follow doesn't take effect immediately, so the viewer needs to be
   * told the `f` they just pressed didn't create the follow yet). */
  onNotify?: ((message: string, kind?: ToastKind) => void) | undefined;
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
  onVisitPage,
  onConfirm,
  onEditProfile,
  onViewFollowers,
  onViewFollowing,
  refreshKey = 0,
  onNotify,
}: ProfileScreenProps): ReactElement {
  const plain = usePlainMode();
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
    const { relationship } = followUi;
    // §197.5: a locked target replies `requested` instead of following immediately —
    // there is no `follows` row yet to unfollow, but `unfollowActor` also deletes any
    // outstanding `FollowRequest`, so it is the same verb `f` uses to cancel one.
    const shouldUnfollow = relationship.state === FOLLOW_STATE.FOLLOWING || relationship.requested;
    setOutcome({ actorId, state: { status: 'loading' } });
    try {
      const accessToken = await ensureAccessToken();
      if (shouldUnfollow) {
        const response = await api.unfollowActor({ actorId }, accessToken);
        if (present(response.relationship)) {
          setOutcome({ actorId, state: { status: 'ready', relationship: response.relationship } });
        }
        return;
      }
      const response = await api.followActor({ actorId }, accessToken);
      if (present(response.relationship)) {
        setOutcome({ actorId, state: { status: 'ready', relationship: response.relationship } });
      }
      if (response.requested) onNotify?.('Follow request sent.', 'success');
    } catch (error) {
      setOutcome({
        actorId,
        state: { status: 'error', error: describeGrpcError(error, api.target) },
      });
    }
  }

  // Not an effect either — a direct response to `a`/`x` on an incoming request
  // (§197.5: `relationship.requested_by`).
  async function respondToFollowRequest(accept: boolean): Promise<void> {
    if (followUi.status !== 'ready' || ensureAccessToken === undefined) return;
    setOutcome({ actorId, state: { status: 'loading' } });
    try {
      const accessToken = await ensureAccessToken();
      if (accept) {
        const response = await api.acceptFollowRequest({ actorId }, accessToken);
        if (present(response.relationship)) {
          setOutcome({ actorId, state: { status: 'ready', relationship: response.relationship } });
          return;
        }
      } else {
        // RejectFollowRequestResponse carries no relationship — re-derive it below
        // so `requested_by` clears from the UI without a full page reload.
        await api.rejectFollowRequest({ actorId }, accessToken);
      }
      const refreshed = await api.getRelationship({ actorId }, accessToken);
      if (present(refreshed.relationship)) {
        setOutcome({ actorId, state: { status: 'ready', relationship: refreshed.relationship } });
      }
    } catch (error) {
      setOutcome({
        actorId,
        state: { status: 'error', error: describeGrpcError(error, api.target) },
      });
    }
  }

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

  /** Raises the shared confirm for `B`/`M`; without a shell to host it (a bare unit
   * render) the destructive action is simply not offered, never performed unasked. */
  function requestModeration(action: ModerationAction): void {
    if (followUi.status !== 'ready' || onConfirm === undefined) return;
    const { blocking, muting } = followUi.relationship;
    const active = action === 'block' ? blocking : muting;
    const verb = action === 'block' ? (active ? 'Unblock' : 'Block') : active ? 'Unmute' : 'Mute';
    const handle = sanitizeForTerminal(
      actorState.status === 'ready' ? actorState.actor.handle : '',
    );
    onConfirm({
      id: `${action}:${actorId}`,
      title: `${verb} @${handle}?`,
      body:
        action === 'block'
          ? 'Blocking hides you from each other and removes any follow between you.'
          : 'Muting hides their posts from your timelines. They are not told.',
      onConfirm: () => void performModeration(action),
    });
  }

  useInput(
    (input) => {
      if (input === 'f') {
        void toggleFollow();
        return;
      }
      if (input === 'a' && followUi.status === 'ready' && followUi.relationship.requestedBy) {
        void respondToFollowRequest(true);
        return;
      }
      if (input === 'x' && followUi.status === 'ready' && followUi.relationship.requestedBy) {
        void respondToFollowRequest(false);
        return;
      }
      if (input === 'B' && followUi.status === 'ready') {
        requestModeration('block');
        return;
      }
      if (input === 'M' && followUi.status === 'ready') {
        requestModeration('mute');
        return;
      }
      if (input === '!' && actorState.status === 'ready') {
        onReportActor?.(actorState.actor);
        return;
      }
      if (input === 'v' && actorState.status === 'ready') {
        onVisitPage?.(actorState.actor);
        return;
      }
      if (input === 'F' && actorState.status === 'ready') {
        onViewFollowers?.(actorState.actor);
        return;
      }
      if (input === 'G' && actorState.status === 'ready') {
        onViewFollowing?.(actorState.actor);
        return;
      }
      if (input === 'e' && actorState.status === 'ready' && actorId === viewerActorId) {
        onEditProfile?.(actorState.actor);
      }
    },
    { isActive: isActive && actorState.status === 'ready' },
  );

  const fetchPage = useCallback(
    async (cursor: string): Promise<PostPage> => {
      // The token is what makes `viewer_state` (liked/bookmarked) come back populated.
      const accessToken = ensureAccessToken === undefined ? undefined : await ensureAccessToken();
      const response = await api.listActorPosts({ actorId, cursor, limit: 20 }, accessToken);
      return { posts: response.posts, page: response.page };
    },
    // `refreshKey` is a deliberate cache-buster, not a value this callback reads:
    // changing its identity is exactly how `usePaginatedList` is told to re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [api, actorId, ensureAccessToken, refreshKey],
  );
  const { posts, loading, loadingMore, hasMore, error, loadMore, refresh, refreshing, newCount } =
    usePaginatedPosts(api.target, fetchPage);

  useInput(
    (input) => {
      if ((input === 'n' || input === ' ') && hasMore) {
        loadMore();
        return;
      }
      // `R` re-reads page one from the server: the `↑ N new` marker, and — the
      // reason it matters — fresh `viewer_state`, so likes made in an earlier
      // session stop looking un-liked.
      if (input === 'R') refresh();
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
  // Text-mode analogues for §173's `avatar_frame`/`profile_border` — the proto leaves
  // both free-form strings (no defined vocabulary), so there is no "correct" art to
  // reproduce; a bracket marker and an Ink `Box` border are a legible stand-in, gated
  // on plain mode exactly like every other nameplate decoration.
  const hasAvatarFrame = !plain && present(actor.nameplate) && actor.nameplate.avatarFrame !== '';
  const hasProfileBorder =
    !plain && present(actor.nameplate) && actor.nameplate.profileBorder !== '';
  // B-130 rapid personalization — all purely cosmetic (§184.3), all degraded: no banner →
  // no line, no frame → the plain profile box (or the older free-text border), no accent →
  // the theme default. A hex passed straight to Ink's `color` is downsampled by chalk to
  // the terminal's actual colour depth (truecolor → 256 → 16), same as a nameplate colour.
  const accent = !plain && actor.accentColor !== '' ? actor.accentColor : undefined;
  const frameBorder = !plain ? frameBorderStyle(actor.profileFrame) : undefined;
  const borderStyle =
    frameBorder ??
    (hasProfileBorder && present(actor.nameplate)
      ? borderStyleFor(actor.nameplate.profileBorder)
      : undefined);
  const tagGlyph = !plain ? nameTagGlyph(actor.nameTagStyle) : '';
  const displayName =
    actor.displayName === '' ? `@${actor.handle}` : sanitizeForTerminal(actor.displayName);

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        {...(borderStyle !== undefined
          ? {
              borderStyle,
              borderColor: accent ?? theme.accent,
              paddingX: 1,
            }
          : {})}
      >
        {!plain && actor.profileBannerUrl !== '' ? (
          <Text color={theme.muted}>░░ banner: {bannerHost(actor.profileBannerUrl)} ░░</Text>
        ) : null}
        <Text color={accent ?? theme.accent} bold>
          {hasAvatarFrame ? '‹ ' : ''}
          <Nameplate
            handle={actor.handle}
            nameplate={actor.nameplate ?? undefined}
            text={displayName}
            bold
            fallbackColor={accent ?? theme.accent}
          />
          {hasAvatarFrame ? ' ›' : ''}
          {tagGlyph === '' ? '' : ` ${tagGlyph}`}
        </Text>
        <Nameplate handle={actor.handle} nameplate={actor.nameplate ?? undefined} />
        {!plain && present(actor.nameplate) && actor.nameplate.statusLine !== '' ? (
          <Text color={theme.muted} wrap="wrap">
            {sanitizeForTerminal(actor.nameplate.statusLine)}
          </Text>
        ) : null}
        {!plain && present(actor.nameplate) && actor.nameplate.badges.length > 0 ? (
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
        <Text color={theme.muted}>F followers · G following</Text>
        {actorId === viewerActorId && onEditProfile !== undefined ? (
          <Text color={theme.muted}>e edit profile</Text>
        ) : null}
        {actorId === viewerActorId ? (
          <Text color={theme.muted}>
            :followrequests pending follow requests · :privacy account privacy
          </Text>
        ) : null}
        {followUi.status === 'ready' ? (
          <Text color={theme.muted}>
            {followUi.relationship.requested
              ? 'follow requested'
              : followUi.relationship.state === FOLLOW_STATE.FOLLOWING
                ? 'following'
                : 'not following'}
            {followUi.relationship.followedBy ? ' · follows you' : ''}
            {'  ·  f to '}
            {followUi.relationship.requested ||
            followUi.relationship.state === FOLLOW_STATE.FOLLOWING
              ? 'unfollow'
              : 'follow'}
            {'  ·  B to '}
            {followUi.relationship.blocking ? 'unblock' : 'block'}
            {'  ·  M to '}
            {followUi.relationship.muting ? 'unmute' : 'mute'}
          </Text>
        ) : null}
        {/* §197.5: the target sent *us* a follow request — only meaningful on a
            locked viewer's own account, since that is the only relationship a
            request-to-us can exist on. */}
        {followUi.status === 'ready' && followUi.relationship.requestedBy ? (
          <Text color={theme.muted}>wants to follow you — a accept · x reject</Text>
        ) : null}
        {followUi.status === 'error' ? (
          <Text color={theme.error}>{followUi.error.title}</Text>
        ) : null}
      </Box>

      {error === undefined ? null : (
        <Box marginTop={1}>
          <Text color={theme.error}>{error.title}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <PostList
          posts={posts}
          loading={loading || loadingMore || refreshing}
          newCount={newCount}
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
