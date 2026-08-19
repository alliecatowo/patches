import { randomUUID } from 'node:crypto';

import { Box, Text, useApp, useInput, useStdin, useWindowSize, type Key } from 'ink';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FOLLOW_STATE, type Actor, type Post } from '@patches/proto';

import { present } from '../api/present.js';
import type { PatchesApi } from '../api/client.js';
import { describeGrpcError } from '../api/errors.js';
import type { CredentialStore } from '../auth/credential-store.js';
import { SessionManager, type ActiveSession } from '../auth/session.js';
import { FileDraftStore, type ComposeDraft, type DraftStore } from '../compose/draft-store.js';
import type { PageDraftStore } from '../pages/draft-store.js';
import type { PostRowActions } from '../components/PostList.js';
import { StatusBar } from '../components/StatusBar.js';
import { TerminalTooSmall } from '../components/TerminalTooSmall.js';
import { ToastLine, type Toast, type ToastKind } from '../components/Toast.js';
import { useServerInfo } from '../hooks/useServerInfo.js';
import { useUnreadCount } from '../hooks/useUnreadCount.js';
import { MediaCache } from '../media/cache.js';
import { MediaSessionProvider } from '../media/media-session.js';
import { openMediaExternally, type OpenMediaOptions } from '../media/open-external.js';
import { AccountsScreen } from '../screens/AccountsScreen.js';
import { BookmarksScreen } from '../screens/BookmarksScreen.js';
import { ComposeScreen } from '../screens/ComposeScreen.js';
import { EditProfileScreen } from '../screens/EditProfileScreen.js';
import { HelpScreen } from '../screens/HelpScreen.js';
import { LocalScreen } from '../screens/LocalScreen.js';
import { HomeScreen } from '../screens/HomeScreen.js';
import { LoginScreen } from '../screens/LoginScreen.js';
import { NotificationsScreen } from '../screens/NotificationsScreen.js';
import { PageScreen, type PageScreenProps } from '../screens/PageScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { ReportScreen, type ReportTarget } from '../screens/ReportScreen.js';
import { SearchScreen } from '../screens/SearchScreen.js';
import { ThreadScreen } from '../screens/ThreadScreen.js';
import { CommandPalette, type PaletteInvocation } from '../components/CommandPalette.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { MIN_TERMINAL_SIZE, theme } from '../theme/index.js';
import { PlainModeProvider } from '../theme/plain-mode.js';
import { isTruthy } from '../env.js';
import { CommandHistory } from './commands.js';
import {
  createKeyLayerStack,
  isCoalescedKeyRun,
  isCtrlKey,
  isPaletteShortcut,
  KeyLayerProvider,
  legacyInputConsumes,
} from './input.js';
import { hintsFor, SCREEN_TITLES, type Binding, type Screen } from './keymap.js';
import { ContentSizeProvider, FOOTER_ROWS } from './layout.js';
import { ModalStackProvider, useModalStackController } from './modal.js';
import type { ListJump } from './list-movement.js';
import {
  canGoBack,
  currentEntry,
  jump,
  pop,
  push,
  reset,
  rootEntry,
  type NavEntry,
  type NavStack,
} from './navigation.js';

export interface AppProps {
  api: PatchesApi;
  credentialStore: CredentialStore;
  draftStore?: DraftStore;
  env?: NodeJS.ProcessEnv;
  /** Overridden in tests — a real `MediaCache` writes to the user's XDG cache dir. */
  mediaCache?: MediaCache;
  /** Threaded into every `o` (open externally) call — tests inject `spawnFn` here to
   * record the call instead of actually launching an OS opener (spec §76). */
  openMediaOptions?: OpenMediaOptions;
  /** Threaded into `PageScreen`'s `e` (edit) flow — tests inject `runEditor` here
   * instead of actually spawning `$EDITOR` against a real TTY (P45-006). */
  pageEditorOptions?: PageScreenProps['editorOptions'];
  /** Overridden in tests — a real `FilePageDraftStore` writes to the user's XDG data dir. */
  pageDraftStore?: PageDraftStore;
  /** `patches visit @handle[/slug]` (P45-006) — opens straight to that actor's
   * Patches Page, one level above the timeline so `Esc` still lands somewhere. */
  initialPageTarget?: { handle: string; slug: string } | undefined;
}

/** Optimistic overlay for one post's reaction state (P4-004, spec §79) — only the
 * fields a toggle actually changes; everything else keeps the server's last value. */
interface ReactionOverride {
  liked?: boolean;
  bookmarked?: boolean;
  reposted?: boolean;
  likes?: number;
  reposts?: number;
}

function emptyDraft(): ComposeDraft {
  return { body: '', clientRequestId: randomUUID() };
}

/** A fresh reply draft for `target` — never continues a different draft's text into a
 * new reply target (P4-004: "draft per reply target"). */
function replyDraft(target: Post): ComposeDraft {
  return {
    body: '',
    clientRequestId: randomUUID(),
    inReplyToId: target.id,
    replyingToHandle: target.author?.handle ?? target.author?.id ?? '',
  };
}

function quoteDraft(target: Post): ComposeDraft {
  return {
    body: '',
    clientRequestId: randomUUID(),
    quotedPostId: target.id,
    quotingHandle: target.author?.handle ?? target.author?.id ?? '',
  };
}

/** After signing in, a stack rooted on the local timeline should be rooted on home
 * instead — without throwing away wherever the viewer had navigated to. */
function promoteRootToHome(stack: NavStack): NavStack {
  if (stack[0].screen !== 'local') return stack;
  return [{ screen: 'home' }, ...stack.slice(1)] as unknown as NavStack;
}

export function App({
  api,
  credentialStore,
  draftStore,
  env = process.env,
  initialPageTarget,
  mediaCache,
  openMediaOptions,
  pageEditorOptions,
  pageDraftStore,
}: AppProps): ReactElement {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const { columns, rows } = useWindowSize();
  const { state: serverInfoState, retry: retryServerInfo } = useServerInfo(api);

  // The navigation stack (see `navigation.ts`). Patches opens straight onto a
  // timeline — the local one while signed out, home once a stored session restores
  // (owner feedback 2026-08-18: "help screen up by default entering, it should auto
  // show home screen"). Connection state lives in the status bar, not a splash.
  const [stack, setStack] = useState<NavStack>(() =>
    initialPageTarget === undefined
      ? reset(rootEntry(false))
      : [
          rootEntry(false),
          {
            screen: 'page',
            handle: initialPageTarget.handle,
            slug: initialPageTarget.slug,
          },
        ],
  );
  const entry = currentEntry(stack);
  const screen: Screen = entry.screen;
  const inputLayers = useMemo(() => createKeyLayerStack(), []);
  const modals = useModalStackController();
  const [commandHistory] = useState(() => new CommandHistory());
  // True once the viewer has pressed a navigation key — after that, a session
  // restoring in the background must not yank them somewhere else.
  const navigated = useRef(false);
  // Raised by a screen whose *sub-mode* owns the keyboard (PageScreen's guestbook
  // signing, its block editor) — without it, `Esc` would both cancel the sub-mode and
  // pop the navigation stack.
  const [, setLegacySubmodeState] = useState(false);
  const legacySubmodeActiveRef = useRef(false);
  function setLegacySubmodeActive(active: boolean): void {
    legacySubmodeActiveRef.current = active;
    setLegacySubmodeState(active);
  }
  // `g g` — the shell owns the `g` prefix, so the jump is handed to whichever list is
  // showing rather than handled by it. `G` (bottom) needs no prefix and is handled by
  // the list itself (`list-movement.ts`).
  const [listJump, setListJump] = useState<ListJump | undefined>(undefined);
  // Bumped after any successful post, so the timeline/thread you land on re-reads
  // itself and your new post is actually there.
  const [feedNonce, setFeedNonce] = useState(0);

  const [toast, setToast] = useState<Toast | undefined>(undefined);
  // Mirrored in a ref, and the ref is what the input handler reads. Ink delivers every
  // key in one stdin chunk through the *same* handler closure, so a `g` and an `h`
  // typed fast enough to arrive together would both see the pre-`g` state value and the
  // jump would silently do nothing (reproduced under tmux, QA 2026-08-19).
  const [pendingGo, setPendingGoState] = useState(false);
  const pendingGoRef = useRef(false);
  const pendingGoTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  function setPendingGo(next: boolean): void {
    pendingGoRef.current = next;
    setPendingGoState(next);
  }
  // Spec §173's required "plain mode that strips all decoration" — starts from
  // `PATCHES_PLAIN`/`--plain` (`env` is normalized by `cli.tsx`) and is toggleable at
  // runtime with `P` (below).
  const [plain, setPlain] = useState(() => isTruthy(env.PATCHES_PLAIN));
  const [quiet, setQuiet] = useState(false);

  const [sessionManager] = useState(
    () => new SessionManager({ api, store: credentialStore, nodeOrigin: api.target }),
  );
  const [session, setSession] = useState<ActiveSession | undefined>(sessionManager.session);
  // Stable across renders (sessionManager is a `useState` initializer) — passed to
  // screens that key an effect off it (`ProfileScreen`'s relationship fetch); an
  // inline `() => sessionManager.ensureAccessToken()` would be a new function every
  // render and re-trigger that effect on every keystroke.
  const ensureAccessToken = useCallback(() => sessionManager.ensureAccessToken(), [sessionManager]);

  const [store] = useState<DraftStore>(() => draftStore ?? new FileDraftStore());
  const [draft, setDraft] = useState<ComposeDraft>(emptyDraft);

  // One cache/session for the whole app (spec §32) — `useMemo` so `MediaAttachments`'
  // fetch effect (keyed on this object's identity) doesn't refire every render.
  const [cache] = useState<MediaCache>(() => mediaCache ?? new MediaCache());
  const mediaSession = useMemo(
    () => ({ api, cache, ensureAccessToken }),
    [api, cache, ensureAccessToken],
  );

  // Optimistic like/bookmark overlay (P4-004, spec §79), keyed by post id — applied at
  // render time (`decoratePost`) over whatever `viewerState`/`counts` a given screen's
  // own paginated list last fetched, so a like registers immediately no matter which
  // list (home/local/profile/thread/bookmarks) is currently showing that post.
  //
  // Cleared on login, logout and `R` (refresh): an overlay left over from a previous
  // session would otherwise sit on top of the server's freshly-read `viewer_state` and
  // mask it (owner feedback 2026-08-18: "posts I liked, after starting a new session,
  // showed not liked").
  const [reactionOverrides, setReactionOverrides] = useState<ReadonlyMap<string, ReactionOverride>>(
    new Map(),
  );

  // Bumped by `NotificationsScreen`'s `m` so the status-bar badge doesn't wait for
  // `useUnreadCount`'s next screen-change/60s refresh (`screenKey` below).
  const [unreadNonce, setUnreadNonce] = useState(0);
  const unreadCount = useUnreadCount(
    api,
    session !== undefined,
    ensureAccessToken,
    `${screen}:${String(unreadNonce)}`,
  );

  // Auto sign-in from a stored refresh token, and resume an unsent draft — both
  // best-effort: nothing here should block first render (spec §80/§37). `sessionManager`
  // and `store` are stable for the component's lifetime (created once via `useState`
  // initializers above), so this still only ever runs once.
  useEffect(() => {
    void sessionManager.restore().then((restored) => {
      if (restored === undefined) return;
      setSession(restored);
      // Only if the viewer hasn't already gone somewhere themselves.
      if (!navigated.current) setStack((current) => promoteRootToHome(current));
    });
    void store.load().then((loaded) => {
      if (loaded !== undefined) setDraft(loaded);
    });
  }, [sessionManager, store]);

  useEffect(() => {
    if (toast === undefined) return;
    const timer = setTimeout(() => setToast(undefined), toast.kind === 'error' ? 5000 : 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  function notify(message: string, kind: ToastKind = 'info'): void {
    setToast({ message, kind });
  }

  // --- navigation -----------------------------------------------------------

  function closeTopModal(): void {
    notify(`closed ${modals.top?.id ?? 'none'}`);
    modals.closeTop();
  }

  function clearModals(): void {
    modals.clear();
  }

  /** Drill down one level (a post's thread, an author's profile, a page). */
  function navigate(next: NavEntry): void {
    navigated.current = true;
    setLegacySubmodeActive(false);
    clearModals();
    setStack((current) => push(current, next));
  }

  /** A `g x`-style jump — see `navigation.jump`. */
  function goTo(next: NavEntry): void {
    navigated.current = true;
    setLegacySubmodeActive(false);
    clearModals();
    setStack((current) => jump(current, next));
  }

  /** `Esc` (and `q` away from the root) — exactly one level, from every screen. */
  function back(): void {
    navigated.current = true;
    setLegacySubmodeActive(false);
    setStack((current) => pop(current));
  }

  function requireSession(next: NavEntry): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    goTo(next);
  }

  function toggleHelp(): void {
    if (modals.top?.id === 'help') closeTopModal();
    else modals.push({ id: 'help', title: 'Help', render: () => null });
  }

  /** Opens `profile` on a given actor — the caller's own, or a post's author. */
  function openProfile(actorId: string, knownActor: Actor | undefined): void {
    navigate({ screen: 'profile', actorId, knownActor });
  }

  function openOwnProfile(): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    goTo({ screen: 'profile', actorId: session.userId, knownActor: session.actor });
  }

  /** `v` on a profile, or `g v` for the caller's own (P45-006) — opens that actor's
   * Patches Page. Pages are anonymous-readable (spec §170), so viewing someone
   * else's needs no session. */
  function openPage(handle: string, slug = ''): void {
    navigate({ screen: 'page', handle, slug });
  }

  function openOwnPage(): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    const handle = session.actor?.handle;
    if (handle === undefined || handle === '') {
      notify("Your profile hasn't loaded yet — try again in a moment.");
      return;
    }
    goTo({ screen: 'page', handle, slug: '' });
  }

  /** `p` on a selected post row (B-017) — profile viewing needs no session. */
  function openAuthorProfile(post: Post): void {
    if (!present(post.author)) return;
    openProfile(post.author.id, post.author);
  }

  /** `Enter` on a post row — opens/drills into its thread. Each level is its own
   * stack entry, so `Esc` unwinds them one at a time. */
  function openThread(postId: string): void {
    navigate({ screen: 'thread', postId });
  }

  function updateDraft(next: ComposeDraft): void {
    setDraft(next);
    void store.save(next);
  }

  /** `r` on a post row (P4-004) — opens compose scoped to that reply target. A
   * different target than the current draft's starts a fresh draft rather than
   * continuing someone else's reply text into it. */
  function openReply(post: Post): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    if (draft.inReplyToId !== post.id) {
      updateDraft(replyDraft(post));
    }
    goTo({ screen: 'compose' });
  }

  // --- reactions ------------------------------------------------------------

  /** Merges this post's `ReactionOverride` (if any) over its last-fetched
   * `viewerState`/`counts` — the single place every screen's rendering goes
   * through so a like/bookmark registers no matter which list is showing the
   * post (spec §79: optimistic UI). */
  function decoratePost(post: Post): Post {
    const override = reactionOverrides.get(post.id);
    if (override === undefined) return post;
    const viewerState = post.viewerState ?? { liked: false, bookmarked: false, reposted: false };
    const counts = post.counts ?? { replies: 0, likes: 0, reposts: 0, quotes: 0 };
    return {
      ...post,
      viewerState: {
        liked: override.liked ?? viewerState.liked,
        bookmarked: override.bookmarked ?? viewerState.bookmarked,
        reposted: override.reposted ?? viewerState.reposted,
      },
      counts: {
        ...counts,
        likes: override.likes ?? counts.likes,
        reposts: override.reposts ?? counts.reposts,
      },
    };
  }

  function setReactionOverride(postId: string, patch: ReactionOverride): void {
    setReactionOverrides((previous) => {
      const next = new Map(previous);
      next.set(postId, { ...next.get(postId), ...patch });
      return next;
    });
  }

  /** `l` on a post row (P4-004, spec §53/§79) — optimistic, reverted on failure. */
  async function toggleLike(post: Post): Promise<void> {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    const current = decoratePost(post);
    const wasLiked = current.viewerState?.liked ?? false;
    const priorLikes = current.counts?.likes ?? 0;
    setReactionOverride(post.id, {
      liked: !wasLiked,
      likes: Math.max(0, priorLikes + (wasLiked ? -1 : 1)),
    });
    try {
      const accessToken = await ensureAccessToken();
      const response = wasLiked
        ? await api.unlikePost({ postId: post.id }, accessToken)
        : await api.likePost({ postId: post.id }, accessToken);
      setReactionOverride(post.id, {
        liked: response.viewerState?.liked ?? !wasLiked,
        likes: response.counts?.likes ?? priorLikes,
      });
      notify(wasLiked ? 'Like removed.' : 'Liked.', 'success');
    } catch (error) {
      setReactionOverride(post.id, { liked: wasLiked, likes: priorLikes });
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  /** `b` on a post row (P4-004, spec §53/§79) — optimistic, reverted on failure. */
  async function toggleBookmark(post: Post): Promise<void> {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    const current = decoratePost(post);
    const wasBookmarked = current.viewerState?.bookmarked ?? false;
    setReactionOverride(post.id, { bookmarked: !wasBookmarked });
    try {
      const accessToken = await ensureAccessToken();
      const response = wasBookmarked
        ? await api.unbookmarkPost({ postId: post.id }, accessToken)
        : await api.bookmarkPost({ postId: post.id }, accessToken);
      setReactionOverride(post.id, {
        bookmarked: response.viewerState?.bookmarked ?? !wasBookmarked,
      });
      notify(wasBookmarked ? 'Bookmark removed.' : 'Bookmarked.', 'success');
    } catch (error) {
      setReactionOverride(post.id, { bookmarked: wasBookmarked });
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  async function toggleRepost(post: Post): Promise<void> {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    const current = decoratePost(post);
    const wasReposted = current.viewerState?.reposted ?? false;
    const priorReposts = current.counts?.reposts ?? 0;
    setReactionOverride(post.id, {
      reposted: !wasReposted,
      reposts: Math.max(0, priorReposts + (wasReposted ? -1 : 1)),
    });
    try {
      const accessToken = await ensureAccessToken();
      const response = wasReposted
        ? await api.unrepostPost({ postId: post.id }, accessToken)
        : await api.repostPost({ postId: post.id }, accessToken);
      setReactionOverride(post.id, {
        reposted: response.viewerState?.reposted ?? !wasReposted,
        reposts: response.counts?.reposts ?? priorReposts,
      });
      notify(wasReposted ? 'Repost removed.' : 'Reposted.', 'success');
    } catch (error) {
      setReactionOverride(post.id, { reposted: wasReposted, reposts: priorReposts });
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  function openQuote(post: Post): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    updateDraft(quoteDraft(post));
    goTo({ screen: 'compose' });
  }

  function confirmDelete(post: Post): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    modals.push({
      id: `delete-post:${post.id}`,
      title: 'Delete post?',
      render: ({ closeTop }) => (
        <ConfirmDialog
          id={`delete-post:${post.id}`}
          title="Delete post?"
          body="This leaves a tombstone and cannot be undone."
          onCancel={closeTop}
          onConfirm={() => {
            closeTop();
            void ensureAccessToken()
              .then((accessToken) => api.deletePost({ id: post.id }, accessToken))
              .then(
                () => {
                  setFeedNonce((current) => current + 1);
                  notify('Post deleted.', 'success');
                },
                (error: unknown) => notify(describeGrpcError(error, api.target).title, 'error'),
              );
          }}
        />
      ),
    });
  }

  async function togglePin(post: Post): Promise<void> {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    const pinned = session.actor?.pinnedPostIds.includes(post.id) ?? false;
    try {
      const accessToken = await ensureAccessToken();
      await (pinned
        ? api.unpinPost({ postId: post.id }, accessToken)
        : api.pinPost({ postId: post.id, position: 0 }, accessToken));
      setSession((current) => {
        if (current?.actor === undefined) return current;
        const pinnedPostIds = pinned
          ? current.actor.pinnedPostIds.filter((id) => id !== post.id)
          : [...current.actor.pinnedPostIds, post.id];
        return { ...current, actor: { ...current.actor, pinnedPostIds } };
      });
      notify(pinned ? 'Post unpinned.' : 'Post pinned.', 'success');
    } catch (error) {
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  /** `f` on a post row — follow/unfollow its author without leaving the timeline.
   * Reads the current relationship first (a row carries no follow state), so this is
   * two round trips rather than the profile screen's one. */
  async function toggleFollowAuthor(post: Post): Promise<void> {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    if (!present(post.author)) return;
    const author = post.author;
    if (author.id === session.userId) {
      notify('That is your own post.');
      return;
    }
    try {
      const accessToken = await ensureAccessToken();
      const current = await api.getRelationship({ actorId: author.id }, accessToken);
      const following =
        present(current.relationship) && current.relationship.state === FOLLOW_STATE.FOLLOWING;
      if (following) {
        await api.unfollowActor({ actorId: author.id }, accessToken);
        notify(`Unfollowed @${author.handle}.`, 'success');
      } else {
        await api.followActor({ actorId: author.id }, accessToken);
        notify(`Following @${author.handle}.`, 'success');
      }
    } catch (error) {
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  /** `!` — opens the report screen scoped to a post or an actor (spec §55). */
  function openReport(target: ReportTarget): void {
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    navigate({ screen: 'report', target });
  }

  function reportPost(post: Post): void {
    const handle = post.author?.handle;
    openReport({
      type: 'post',
      id: post.id,
      label: handle !== undefined && handle !== '' ? `@${handle}'s post` : 'this post',
    });
  }

  function reportActor(actor: Actor): void {
    openReport({ type: 'actor', id: actor.id, label: `@${actor.handle}` });
  }

  /** `o` on a post row (B-004/P5-003, spec §76) — downloads and opens its first
   * attachment with the OS default handler. A no-op (not an error) for a post with no
   * media. */
  function openMedia(post: Post): void {
    const first = post.media[0];
    if (first === undefined) return;
    if (session === undefined) {
      notify('Log in first — press L.');
      return;
    }
    openMediaExternally(api, cache, first, ensureAccessToken, { env, ...openMediaOptions }).catch(
      (error: unknown) => {
        notify(describeGrpcError(error, api.target).title, 'error');
      },
    );
  }

  /** `x` on the accounts screen (B-022) — signs out and returns to a logged-out root. */
  async function logout(): Promise<void> {
    await sessionManager.logout();
    setSession(undefined);
    setReactionOverrides(new Map());
    // A "Signed in as @alice" toast outliving the sign-out would be actively wrong.
    setToast(undefined);
    setStack(reset(rootEntry(false)));
  }

  /** `r` on the accounts screen, only offered while `emailVerified` is false (A-028) —
   * the code itself still only arrives by email and is entered via `patches verify
   * <code>`, not in-app (there is no code-entry flow here). */
  async function resendVerificationEmail(): Promise<void> {
    try {
      const accessToken = await ensureAccessToken();
      await api.resendVerification(accessToken);
      notify('Verification email sent.', 'success');
    } catch (error) {
      notify(describeGrpcError(error, api.target).title, 'error');
    }
  }

  const rowActions: PostRowActions = {
    onOpenPost: (post) => openThread(post.id),
    onOpenAuthor: openAuthorProfile,
    onReply: openReply,
    onToggleLike: (post) => void toggleLike(post),
    onToggleBookmark: (post) => void toggleBookmark(post),
    onToggleFollow: (post) => void toggleFollowAuthor(post),
    onToggleRepost: (post) => void toggleRepost(post),
    onQuote: openQuote,
    onEdit: () => notify('Post editing route is not connected yet.', 'error'),
    onDelete: confirmDelete,
    onHistory: () => notify('Post history route is not connected yet.', 'error'),
    onTogglePin: (post) => void togglePin(post),
    onReport: reportPost,
    onOpenMedia: openMedia,
    decorate: decoratePost,
    jump: listJump,
  };

  function setToggle(
    value: string | undefined,
    current: boolean,
    update: (next: boolean) => void,
    label: string,
  ): void {
    if (value !== undefined && !['on', 'off', 'toggle'].includes(value)) {
      notify(`${label} expects on, off, or toggle.`, 'error');
      return;
    }
    const next = value === 'on' ? true : value === 'off' ? false : !current;
    update(next);
    notify(`${label} ${next ? 'on' : 'off'}.`, 'success');
  }

  function forceQuit(): void {
    const hasDraft = draft.body !== '' || (draft.attachments?.length ?? 0) > 0;
    if (!hasDraft) {
      exit();
      return;
    }
    modals.push({
      id: 'discard-draft',
      title: 'Discard draft and quit?',
      render: ({ closeTop }) => (
        <ConfirmDialog
          id="discard-draft"
          title="Discard draft and quit?"
          body="Your current post draft will be discarded."
          onConfirm={exit}
          onCancel={closeTop}
        />
      ),
    });
  }

  function safeQuit(): void {
    if (canGoBack(stack)) back();
    else exit();
  }

  function executeBinding(
    binding: Binding,
    command: string | undefined,
    args: readonly string[],
  ): void {
    const name = command ?? binding.commands?.[0]?.name;
    switch (name) {
      case 'q':
      case 'quit':
      case 'back':
        safeQuit();
        return;
      case 'q!':
        forceQuit();
        return;
      case 'home':
        requireSession({ screen: 'home' });
        return;
      case 'local':
        goTo({ screen: 'local' });
        return;
      case 'profile': {
        const target = args[0];
        if (target === undefined) {
          openOwnProfile();
          return;
        }
        const query = target.replace(/^@/u, '');
        void api.searchActors({ query, cursor: '', limit: 20 }).then(
          (response) => {
            const actor = response.actors.find((candidate) => candidate.handle === query);
            if (actor === undefined) notify(`No profile found for @${query}.`, 'error');
            else openProfile(actor.id, actor);
          },
          (error: unknown) => notify(describeGrpcError(error, api.target).title, 'error'),
        );
        return;
      }
      case 'page': {
        const target = args[0];
        if (target === undefined) {
          openOwnPage();
          return;
        }
        const [handle = '', slug = ''] = target.replace(/^@/u, '').split('/', 2);
        if (handle === '') notify('Page expects @handle[/slug].', 'error');
        else openPage(handle, slug);
        return;
      }
      case 'search':
        goTo({ screen: 'search' });
        if (args.length > 0) notify(`Search opened for “${args.join(' ')}”.`);
        return;
      case 'notifications':
        requireSession({ screen: 'notifications' });
        return;
      case 'bookmarks':
        requireSession({ screen: 'bookmarks' });
        return;
      case 'help':
        toggleHelp();
        return;
      case 'reload':
        retryServerInfo();
        setReactionOverrides(new Map());
        setFeedNonce((current) => current + 1);
        notify('Reloaded (Ctrl+R).', 'success');
        return;
      case 'plain':
        setToggle(args[0], plain, setPlain, 'Plain mode');
        return;
      case 'quiet':
        setToggle(args[0], quiet, setQuiet, 'Quiet feed');
        return;
      case 'w':
      case 'post':
      case 'wq':
        notify(`:${name} is only available from an editor that supports shell commands.`, 'error');
        return;
      case 'messages':
      case 'communities':
      case 'tag':
      case 'theme':
        notify(
          `:${name} is registered but its screen is not connected to this shell yet.`,
          'error',
        );
        return;
    }

    switch (binding.keys) {
      case 'g h':
        requireSession({ screen: 'home' });
        return;
      case 'g l':
        goTo({ screen: 'local' });
        return;
      case 'g p':
        openOwnProfile();
        return;
      case 'g b':
        requireSession({ screen: 'bookmarks' });
        return;
      case 'g n':
        requireSession({ screen: 'notifications' });
        return;
      case 'g v':
        openOwnPage();
        return;
      case '/':
        goTo({ screen: 'search' });
        return;
      case 'c':
        requireSession({ screen: 'compose' });
        return;
      case 'P':
        setPlain((current) => !current);
        return;
      case '?':
        toggleHelp();
        return;
      case 'Esc':
        back();
        return;
      case 'q':
        safeQuit();
        return;
      case 'Ctrl+R':
        retryServerInfo();
        setReactionOverrides(new Map());
        setFeedNonce((current) => current + 1);
        return;
      default:
        notify(`${binding.keys} — ${binding.description ?? binding.hint}`);
    }
  }

  function invokePalette(invocation: PaletteInvocation): void {
    executeBinding(
      invocation.binding,
      invocation.source === 'command' ? invocation.alias.name : undefined,
      invocation.args,
    );
  }

  function openCommandPalette(): void {
    modals.push({
      id: 'command-palette',
      title: 'Commands',
      render: ({ closeTop }) => (
        <CommandPalette
          screen={screen}
          authenticated={session !== undefined}
          history={commandHistory}
          onInvoke={invokePalette}
          onError={(message) => notify(message, 'error')}
          onClose={closeTop}
        />
      ),
    });
  }

  // --- the shell input dispatcher ------------------------------------------
  // Registered modal/sub-mode/screen layers run top-down. Legacy text screens
  // are represented by a compatibility layer until they adopt `useKeyLayer`;
  // this consumes printable keys without disabling Ctrl+C or Ctrl+P.
  function handleShellInput(input: string, key: Key): void {
    // Keys typed fast enough to land in one stdin read reach Ink as a single
    // multi-character keypress; replay them one at a time so `g h` works at speed.
    if (isCoalescedKeyRun(input, key)) {
      for (const character of input) handleShellInput(character, key);
      return;
    }
    if (isCtrlKey(input, key, 'c')) {
      exit();
      return;
    }
    if (inputLayers.dispatch(input, key)) return;
    if (modals.top !== undefined && key.escape) {
      closeTopModal();
      return;
    }
    const legacyTextScreen = ['login', 'compose', 'search', 'report', 'editProfile'].includes(
      screen,
    );
    if (key.escape && legacySubmodeActiveRef.current) {
      legacySubmodeActiveRef.current = false;
      setLegacySubmodeState(false);
      return;
    }
    if (legacyInputConsumes(input, key, legacyTextScreen || legacySubmodeActiveRef.current)) {
      return;
    }
    if (isPaletteShortcut(input, key)) {
      openCommandPalette();
      return;
    }
    if (pendingGoRef.current) {
      setPendingGo(false);
      if (input === 'p') openOwnProfile();
      else if (input === 'l') goTo({ screen: 'local' });
      else if (input === 'h') requireSession({ screen: 'home' });
      else if (input === 's') goTo({ screen: 'search' });
      else if (input === 'b') requireSession({ screen: 'bookmarks' });
      else if (input === 'n') requireSession({ screen: 'notifications' });
      else if (input === 'v') openOwnPage();
      else if (input === 'e') requireSession({ screen: 'editProfile' });
      else if (input === 'd' || input === 'c') {
        notify(`g ${input} is registered but its screen is not connected yet.`, 'error');
      } else if (input === 'g') {
        setListJump((current) => ({ edge: 'top', nonce: (current?.nonce ?? 0) + 1 }));
      }
      return;
    }
    if (key.escape) {
      back();
      return;
    }
    if (input === 'q') {
      safeQuit();
      return;
    }
    if (input === '?') {
      toggleHelp();
      return;
    }
    if (isCtrlKey(input, key, 'r')) {
      retryServerInfo();
      setReactionOverrides(new Map());
      setFeedNonce((current) => current + 1);
      return;
    }
    if (input === 'L') {
      goTo({ screen: session === undefined ? 'login' : 'accounts' });
      return;
    }
    if (input === 'P') {
      setPlain((current) => !current);
      return;
    }
    if (input === 'c') {
      requireSession({ screen: 'compose' });
      return;
    }
    if (input === '/') {
      goTo({ screen: 'search' });
      return;
    }
    if (input === 'g') {
      setPendingGo(true);
      clearTimeout(pendingGoTimer.current);
      pendingGoTimer.current = setTimeout(() => setPendingGo(false), 600);
    }
  }
  useInput(handleShellInput, { isActive: isRawModeSupported });

  // Checked after the hooks, never before — hook order must not depend on size.
  if (columns < MIN_TERMINAL_SIZE.columns || rows < MIN_TERMINAL_SIZE.rows) {
    return <TerminalTooSmall columns={columns} rows={rows} />;
  }

  const screenIsActive = modals.top === undefined || modals.top.id === 'help';
  const listIsActive = !pendingGo && screenIsActive;
  // Every frame is laid out to an exact budget and clipped: content box + footer ==
  // `rows`, and nothing inside either may overflow. A frame taller than the terminal
  // is what desynchronises Ink's line diff and smears the timeline (owner report
  // 2026-08-18, reproduced on v0.1.0-alpha.2) — see `format/measure.ts`.
  const contentRows = Math.max(3, rows - FOOTER_ROWS);
  const signedOutOnRoot = session === undefined && (screen === 'home' || screen === 'local');

  return (
    <MediaSessionProvider session={mediaSession}>
      <PlainModeProvider plain={plain}>
        <ModalStackProvider controller={modals}>
          <KeyLayerProvider stack={inputLayers}>
            <ContentSizeProvider
              size={{ rows: contentRows - 2, columns: Math.max(20, columns - 2) }}
            >
              {/* `flexShrink={0}` on every direct child of a height-constrained Box is
            load-bearing, not decoration: Yoga's default lets children shrink to fit,
            and Ink renders a shrunk child by *dropping rows out of the middle of it*,
            which is precisely the corrupted timeline the owner reported — counts lines
            painted over the previous post's header, bodies cut mid-word (verified
            against Ink 7.1.1; see docs/agents/LEARNINGS.md). With `flexShrink={0}` the
            overflow is clipped cleanly at the bottom instead. */}
              <Box flexDirection="column" height={rows} width={columns} overflow="hidden">
                <Box
                  flexDirection="column"
                  flexShrink={0}
                  height={contentRows}
                  paddingX={1}
                  paddingY={1}
                  overflow="hidden"
                >
                  <Box flexDirection="column" flexShrink={0}>
                    {/* An open overlay hides the screen with `display="none"`, not with a
                        zero height: Yoga skips a `DISPLAY_NONE` subtree during layout *and*
                        Ink skips it while painting, whereas a zero-height box still emits its
                        text into the same rows as the overlay — the timeline bled through the
                        help screen mid-line (QA 2026-08-19). The screen stays mounted, so a
                        sub-mode's in-progress state survives opening the palette. */}
                    <Box
                      flexDirection="column"
                      display={modals.top === undefined ? 'flex' : 'none'}
                      flexShrink={0}
                      overflow="hidden"
                    >
                      {signedOutOnRoot ? (
                        <Text color={theme.muted} wrap="truncate-end">
                          Reading as a guest — press L to log in or create an account.
                        </Text>
                      ) : null}
                      {entry.screen === 'help' && (
                        <HelpScreen
                          target={api.target}
                          serverInfo={serverInfoState}
                          contextScreen={stack[stack.length - 2]?.screen ?? 'local'}
                          isActive
                          onClose={back}
                        />
                      )}
                      {entry.screen === 'local' && (
                        <LocalScreen
                          api={api}
                          isActive={listIsActive}
                          actions={rowActions}
                          ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
                          refreshKey={feedNonce}
                        />
                      )}
                      {entry.screen === 'home' && session !== undefined && (
                        <HomeScreen
                          api={api}
                          isActive={listIsActive}
                          ensureAccessToken={ensureAccessToken}
                          actions={rowActions}
                          refreshKey={feedNonce}
                        />
                      )}
                      {entry.screen === 'home' && session === undefined && (
                        <Text color={theme.muted}>Log in (L) to see the people you follow.</Text>
                      )}
                      {entry.screen === 'search' && (
                        <SearchScreen
                          api={api}
                          isActive={screenIsActive}
                          ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
                          onOpenActor={(actor) => openProfile(actor.id, actor)}
                          actions={rowActions}
                          onCancel={back}
                        />
                      )}
                      {entry.screen === 'profile' && (
                        <ProfileScreen
                          api={api}
                          actorId={entry.actorId}
                          knownActor={entry.knownActor}
                          isActive={listIsActive}
                          actions={rowActions}
                          viewerActorId={session?.userId}
                          ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
                          onReportActor={reportActor}
                          onVisitPage={(actor) => openPage(actor.handle)}
                          onEditProfile={
                            session === undefined
                              ? undefined
                              : () => navigate({ screen: 'editProfile' })
                          }
                          refreshKey={feedNonce}
                        />
                      )}
                      {entry.screen === 'editProfile' &&
                        session !== undefined &&
                        session.actor !== undefined && (
                          <EditProfileScreen
                            api={api}
                            actor={session.actor}
                            ensureAccessToken={ensureAccessToken}
                            isActive={screenIsActive}
                            onCancel={back}
                            onSaved={(actor) => {
                              setSession((current) =>
                                current === undefined ? current : { ...current, actor },
                              );
                              notify('Profile saved.', 'success');
                              back();
                            }}
                          />
                        )}
                      {entry.screen === 'page' && (
                        <PageScreen
                          api={api}
                          handle={entry.handle}
                          initialSlug={entry.slug}
                          viewerActorId={session?.userId}
                          ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
                          isActive={listIsActive}
                          isOwnPage={session?.actor?.handle === entry.handle}
                          onCapturingInput={setLegacySubmodeActive}
                          env={env}
                          draftStore={pageDraftStore}
                          editorOptions={pageEditorOptions}
                        />
                      )}
                      {entry.screen === 'thread' && (
                        <ThreadScreen
                          api={api}
                          postId={entry.postId}
                          isActive={listIsActive}
                          actions={rowActions}
                          ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
                          refreshKey={feedNonce}
                        />
                      )}
                      {entry.screen === 'bookmarks' && session !== undefined && (
                        <BookmarksScreen
                          api={api}
                          isActive={listIsActive}
                          ensureAccessToken={ensureAccessToken}
                          actions={rowActions}
                          refreshKey={feedNonce}
                        />
                      )}
                      {entry.screen === 'notifications' && session !== undefined && (
                        <NotificationsScreen
                          api={api}
                          isActive={listIsActive}
                          ensureAccessToken={ensureAccessToken}
                          onOpenPost={openThread}
                          onOpenAuthor={(actor) => openProfile(actor.id, actor)}
                          onReadStateChanged={() => setUnreadNonce((current) => current + 1)}
                        />
                      )}
                      {entry.screen === 'report' && session !== undefined && (
                        <ReportScreen
                          api={api}
                          target={entry.target}
                          ensureAccessToken={ensureAccessToken}
                          isActive={screenIsActive}
                          onCancel={back}
                          onSubmitted={() => {
                            notify('Report submitted — thank you.', 'success');
                            back();
                          }}
                        />
                      )}
                      {entry.screen === 'accounts' && session !== undefined && (
                        <AccountsScreen
                          api={api}
                          env={env}
                          session={session}
                          isActive={screenIsActive}
                          ensureAccessToken={ensureAccessToken}
                          onLogout={() => void logout()}
                          onResendVerification={() => void resendVerificationEmail()}
                          onBack={back}
                        />
                      )}
                      {entry.screen === 'login' && (
                        <LoginScreen
                          api={api}
                          sessionManager={sessionManager}
                          env={env}
                          isActive={screenIsActive}
                          onCancel={back}
                          onSuccess={(newSession) => {
                            setSession(newSession);
                            // A stale overlay from before signing in would mask the server's
                            // real viewer state for this account.
                            setReactionOverrides(new Map());
                            notify(`Signed in as @${newSession.actor?.handle ?? '…'}.`, 'success');
                            setStack((current) => promoteRootToHome(pop(current)));
                          }}
                        />
                      )}
                      {entry.screen === 'compose' && session !== undefined && (
                        <ComposeScreen
                          api={api}
                          draft={draft}
                          onChange={updateDraft}
                          onCancel={back}
                          isActive={screenIsActive}
                          ensureAccessToken={ensureAccessToken}
                          onSubmitted={(post) => {
                            const cleared = emptyDraft();
                            setDraft(cleared);
                            void store.clear();
                            notify(post.inReplyToId === '' ? 'Posted.' : 'Reply sent.', 'success');
                            setFeedNonce((current) => current + 1);
                            // A reply lands back on the thread of the post it answers — not on
                            // the reply's own thread, which left you able to reply only to
                            // yourself (owner feedback 2026-08-18). `jump` after popping
                            // compose off: if that thread is already on the stack you return to
                            // it rather than stacking a second copy.
                            const landing: NavEntry =
                              post.inReplyToId !== ''
                                ? { screen: 'thread', postId: post.inReplyToId }
                                : {
                                    screen: 'profile',
                                    actorId: present(post.author) ? post.author.id : session.userId,
                                    knownActor: present(post.author) ? post.author : session.actor,
                                  };
                            setStack((current) => jump(pop(current), landing));
                          }}
                        />
                      )}
                    </Box>
                    {modals.top === undefined ? null : (
                      <>
                        {modals.top.id === 'command-palette' ? (
                          <CommandPalette
                            screen={screen}
                            authenticated={session !== undefined}
                            history={commandHistory}
                            onInvoke={invokePalette}
                            onError={(message) => notify(message, 'error')}
                            onClose={closeTopModal}
                          />
                        ) : modals.top.id === 'help' ? (
                          <HelpScreen
                            target={api.target}
                            serverInfo={serverInfoState}
                            contextScreen={screen}
                            isActive
                            onClose={closeTopModal}
                          />
                        ) : (
                          modals.top.render({ closeTop: closeTopModal, clear: clearModals })
                        )}
                      </>
                    )}
                  </Box>
                </Box>

                <Box
                  flexDirection="column"
                  flexShrink={0}
                  height={FOOTER_ROWS}
                  paddingX={1}
                  overflow="hidden"
                >
                  <Text color={theme.muted}>{'─'.repeat(Math.max(0, columns - 2))}</Text>
                  <Box height={1} flexShrink={0} overflow="hidden">
                    {toast === undefined ? <Text> </Text> : <ToastLine toast={toast} />}
                  </Box>
                  <StatusBar
                    width={Math.max(10, columns - 2)}
                    target={api.target}
                    screenTitle={SCREEN_TITLES[screen]}
                    status={statusLabel(serverInfoState.status)}
                    statusColor={statusColor(serverInfoState.status)}
                    handle={session?.actor?.handle}
                    keys={hintsFor(screen, {
                      authenticated: session !== undefined,
                      canGoBack: canGoBack(stack),
                    })}
                    unreadCount={unreadCount}
                  />
                </Box>
              </Box>
            </ContentSizeProvider>
          </KeyLayerProvider>
        </ModalStackProvider>
      </PlainModeProvider>
    </MediaSessionProvider>
  );
}

function statusLabel(status: 'connecting' | 'ready' | 'error'): string {
  switch (status) {
    case 'connecting':
      return 'connecting';
    case 'ready':
      return 'connected';
    case 'error':
      return 'offline';
  }
}

function statusColor(status: 'connecting' | 'ready' | 'error'): string {
  switch (status) {
    case 'connecting':
      return theme.warn;
    case 'ready':
      return theme.ok;
    case 'error':
      return theme.error;
  }
}
