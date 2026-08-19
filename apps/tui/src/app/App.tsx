import { randomUUID } from 'node:crypto';

import { Box, Text, useApp, useInput, useStdin, useWindowSize } from 'ink';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Actor, Post } from '@patches/proto';

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
import { useServerInfo } from '../hooks/useServerInfo.js';
import { useUnreadCount } from '../hooks/useUnreadCount.js';
import { MediaCache } from '../media/cache.js';
import { MediaSessionProvider } from '../media/media-session.js';
import { openMediaExternally, type OpenMediaOptions } from '../media/open-external.js';
import { AccountsScreen } from '../screens/AccountsScreen.js';
import { BookmarksScreen } from '../screens/BookmarksScreen.js';
import { ComposeScreen } from '../screens/ComposeScreen.js';
import { ConnectScreen } from '../screens/ConnectScreen.js';
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
import { MIN_TERMINAL_SIZE, theme } from '../theme/index.js';
import { PlainModeProvider } from '../theme/plain-mode.js';
import { isTruthy } from '../env.js';

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
   * Patches Page instead of the usual `connect` screen. */
  initialPageTarget?: { handle: string; slug: string } | undefined;
}

type Screen =
  | 'connect'
  | 'help'
  | 'login'
  | 'compose'
  | 'profile'
  | 'editProfile'
  | 'local'
  | 'home'
  | 'search'
  | 'thread'
  | 'bookmarks'
  | 'notifications'
  | 'report'
  | 'accounts'
  | 'page';

/** Screens that own the keyboard entirely (text entry) — the app-level keymap steps aside. */
function capturesInput(screen: Screen): boolean {
  return (
    screen === 'login' ||
    screen === 'compose' ||
    screen === 'search' ||
    screen === 'report' ||
    screen === 'editProfile'
  );
}

/** Optimistic overlay for one post's reaction state (P4-004, spec §79) — only the
 * fields a toggle actually changes; everything else keeps the server's last value. */
interface ReactionOverride {
  liked?: boolean;
  bookmarked?: boolean;
  likes?: number;
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

  const [screen, setScreen] = useState<Screen>(
    initialPageTarget === undefined ? 'connect' : 'page',
  );
  const [priorScreen, setPriorScreen] = useState<Screen>('connect');
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [pendingGo, setPendingGo] = useState(false);
  const pendingGoTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  // Spec §173's required "plain mode that strips all decoration" — starts from
  // `PATCHES_PLAIN`/`--plain` (`env` is normalized by `cli.tsx`) and is toggleable at
  // runtime with `P` (below).
  const [plain, setPlain] = useState(() => isTruthy(env.PATCHES_PLAIN));

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

  // Which actor `profile` currently shows — set by `g p` (the caller's own),
  // or by selecting a post's author (B-017). `undefined` until one of those fires.
  const [profileTarget, setProfileTarget] = useState<
    { actorId: string; knownActor: Actor | undefined } | undefined
  >(undefined);

  // Which handle `page` currently shows (P45-006) — set by `v` (a profile's own page)
  // or `g v` (the caller's own).
  const [pageTarget, setPageTarget] = useState<{ handle: string; slug: string } | undefined>(
    initialPageTarget,
  );

  // Thread navigation (P4-004): a stack of post ids, top = the currently focused
  // thread. Drilling into a reply's own replies pushes; `Esc` pops one level and only
  // leaves `screen === 'thread'` once the stack empties (see `openThread`/`threadBack`).
  const [threadStack, setThreadStack] = useState<readonly string[]>([]);

  // Optimistic like/bookmark overlay (P4-004, spec §79), keyed by post id — applied at
  // render time (`decoratePost`) over whatever `viewerState`/`counts` a given screen's
  // own paginated list last fetched, so a like registers immediately no matter which
  // list (home/local/profile/thread/bookmarks) is currently showing that post.
  const [reactionOverrides, setReactionOverrides] = useState<ReadonlyMap<string, ReactionOverride>>(
    new Map(),
  );

  // What `report` currently targets — a post (`!` on a row) or an actor (`!` on a
  // profile). `undefined` until `openReport` fires.
  const [reportTarget, setReportTarget] = useState<ReportTarget | undefined>(undefined);

  // Bumped by `NotificationsScreen`'s `m` so the status-bar badge doesn't wait for
  // `useUnreadCount`'s next screen-change/60s refresh (`screenKey` below).
  const [unreadNonce, setUnreadNonce] = useState(0);
  const unreadCount = useUnreadCount(
    api,
    session !== undefined,
    ensureAccessToken,
    `${screen}:${unreadNonce}`,
  );

  // Auto sign-in from a stored refresh token, and resume an unsent draft — both
  // best-effort: nothing here should block first render (spec §80/§37). `sessionManager`
  // and `store` are stable for the component's lifetime (created once via `useState`
  // initializers above), so this still only ever runs once.
  useEffect(() => {
    void sessionManager.restore().then((restored) => {
      if (restored !== undefined) setSession(restored);
    });
    void store.load().then((loaded) => {
      if (loaded !== undefined) setDraft(loaded);
    });
  }, [sessionManager, store]);

  useEffect(() => {
    if (notice === undefined) return;
    const timer = setTimeout(() => setNotice(undefined), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function go(next: Screen): void {
    setPriorScreen(screen);
    setScreen(next);
  }

  function goHelp(): void {
    if (screen === 'help') setScreen(priorScreen);
    else go('help');
  }

  function requireSession(next: Screen): void {
    if (session === undefined) {
      setNotice('Log in first — press L.');
      return;
    }
    go(next);
  }

  /** Opens `profile` on a given actor — the caller's own, or a post's author. */
  function openProfile(actorId: string, knownActor: Actor | undefined): void {
    setProfileTarget({ actorId, knownActor });
    go('profile');
  }

  function openOwnProfile(): void {
    if (session === undefined) {
      setNotice('Log in first — press L.');
      return;
    }
    openProfile(session.userId, session.actor);
  }

  /** `v` on a profile, or `g v` for the caller's own (P45-006) — opens that actor's
   * Patches Page. `g v` needs a session (there is no "own page" without an own
   * account); `v` on someone else's profile needs none — pages are anonymous-readable
   * (spec §170), same as `GetPage`. */
  function openPage(handle: string, slug = ''): void {
    setPageTarget({ handle, slug });
    go('page');
  }

  function openOwnPage(): void {
    if (session === undefined) {
      setNotice('Log in first — press L.');
      return;
    }
    if (session.actor === undefined) return;
    openPage(session.actor.handle);
  }

  /** `p` on a selected post row (B-017; moved off `Enter` in P4-004) — profile
   * viewing needs no session of its own. */
  function openAuthorProfile(post: Post): void {
    if (!present(post.author)) return;
    openProfile(post.author.id, post.author);
  }

  /** `Enter` on a post row (P4-004) — opens/drills into its thread. Pushes onto
   * `threadStack` when already on the thread screen (viewing a reply's own replies);
   * otherwise this is a fresh entry, so it also remembers `priorScreen` via `go()`. */
  function openThread(postId: string): void {
    if (screen !== 'thread') {
      go('thread');
      setThreadStack([postId]);
      return;
    }
    setThreadStack([...threadStack, postId]);
  }

  /** `Esc` on the thread screen — pops one level, or leaves the thread screen
   * entirely (back to `priorScreen`) once the stack empties. */
  function threadBack(): void {
    if (threadStack.length > 1) {
      setThreadStack(threadStack.slice(0, -1));
      return;
    }
    setThreadStack([]);
    setScreen(priorScreen);
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
      setNotice('Log in first — press L.');
      return;
    }
    if (draft.inReplyToId !== post.id) {
      updateDraft(replyDraft(post));
    }
    go('compose');
  }

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
        reposted: viewerState.reposted,
      },
      counts: { ...counts, likes: override.likes ?? counts.likes },
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
      setNotice('Log in first — press L.');
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
    } catch (error) {
      setReactionOverride(post.id, { liked: wasLiked, likes: priorLikes });
      setNotice(describeGrpcError(error, api.target).title);
    }
  }

  /** `b` on a post row (P4-004, spec §53/§79) — optimistic, reverted on failure. */
  async function toggleBookmark(post: Post): Promise<void> {
    if (session === undefined) {
      setNotice('Log in first — press L.');
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
    } catch (error) {
      setReactionOverride(post.id, { bookmarked: wasBookmarked });
      setNotice(describeGrpcError(error, api.target).title);
    }
  }

  /** `!` — opens the report screen scoped to a post or an actor (spec §55). */
  function openReport(target: ReportTarget): void {
    if (session === undefined) {
      setNotice('Log in first — press L.');
      return;
    }
    setReportTarget(target);
    go('report');
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
      setNotice('Log in first — press L.');
      return;
    }
    openMediaExternally(api, cache, first, ensureAccessToken, { env, ...openMediaOptions }).catch(
      (error: unknown) => {
        setNotice(describeGrpcError(error, api.target).title);
      },
    );
  }

  /** `x` on the accounts screen (B-022) — signs out of the current session and
   * returns to a logged-out screen. */
  async function logout(): Promise<void> {
    await sessionManager.logout();
    setSession(undefined);
    setScreen('connect');
  }

  /** `r` on the accounts screen, only offered while `emailVerified` is false (A-028) —
   * the code itself still only arrives by email and is entered via `patches verify
   * <code>`, not in-app (there is no code-entry flow here). */
  async function resendVerificationEmail(): Promise<void> {
    try {
      const accessToken = await ensureAccessToken();
      await api.resendVerification(accessToken);
      setNotice('Verification email sent.');
    } catch (error) {
      setNotice(describeGrpcError(error, api.target).title);
    }
  }

  const rowActions: PostRowActions = {
    onOpenPost: (post) => openThread(post.id),
    onOpenAuthor: openAuthorProfile,
    onReply: openReply,
    onToggleLike: (post) => void toggleLike(post),
    onToggleBookmark: (post) => void toggleBookmark(post),
    onReport: reportPost,
    onOpenMedia: openMedia,
    decorate: decoratePost,
  };

  useInput(
    (input) => {
      if (input === 'q') {
        exit();
        return;
      }
      if (input === '?') {
        goHelp();
        return;
      }
      if (input === 'R' && screen === 'connect') {
        retryServerInfo();
        return;
      }
      if (input === 'L') {
        go(session === undefined ? 'login' : 'accounts');
        return;
      }
      if (input === 'P') {
        setPlain((current) => !current);
        return;
      }
      if (input === 'c') {
        requireSession('compose');
        return;
      }
      if (input === '/') {
        go('search');
        return;
      }
      if (pendingGo) {
        setPendingGo(false);
        if (input === 'p') openOwnProfile();
        else if (input === 'l') go('local');
        else if (input === 'h') requireSession('home');
        else if (input === 's') go('search');
        else if (input === 'b') requireSession('bookmarks');
        else if (input === 'n') requireSession('notifications');
        else if (input === 'v') openOwnPage();
        return;
      }
      if (input === 'g') {
        setPendingGo(true);
        clearTimeout(pendingGoTimer.current);
        pendingGoTimer.current = setTimeout(() => setPendingGo(false), 600);
      }
    },
    { isActive: isRawModeSupported && !capturesInput(screen) },
  );

  // Checked after the hooks, never before — hook order must not depend on size.
  if (columns < MIN_TERMINAL_SIZE.columns || rows < MIN_TERMINAL_SIZE.rows) {
    return <TerminalTooSmall columns={columns} rows={rows} />;
  }

  return (
    <MediaSessionProvider session={mediaSession}>
      <PlainModeProvider plain={plain}>
        <Box flexDirection="column" justifyContent="space-between" height={rows}>
          <Box flexDirection="column" paddingX={1} paddingY={1}>
            {screen === 'help' && <HelpScreen target={api.target} />}
            {screen === 'connect' && <ConnectScreen target={api.target} state={serverInfoState} />}
            {screen === 'local' && (
              <LocalScreen
                api={api}
                isActive={screen === 'local' && !pendingGo}
                actions={rowActions}
              />
            )}
            {screen === 'home' && session !== undefined && (
              <HomeScreen
                api={api}
                isActive={screen === 'home' && !pendingGo}
                ensureAccessToken={ensureAccessToken}
                actions={rowActions}
              />
            )}
            {screen === 'search' && (
              <SearchScreen
                api={api}
                isActive={screen === 'search'}
                ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
                onOpenActor={(actor) => openProfile(actor.id, actor)}
                onCancel={() => setScreen(priorScreen)}
              />
            )}
            {screen === 'profile' && profileTarget !== undefined && (
              <ProfileScreen
                api={api}
                actorId={profileTarget.actorId}
                knownActor={profileTarget.knownActor}
                isActive={screen === 'profile' && !pendingGo}
                actions={rowActions}
                viewerActorId={session?.userId}
                ensureAccessToken={ensureAccessToken}
                onReportActor={reportActor}
                onVisitPage={(actor) => openPage(actor.handle)}
                onEditProfile={session === undefined ? undefined : () => go('editProfile')}
              />
            )}
            {screen === 'editProfile' && session !== undefined && session.actor !== undefined && (
              <EditProfileScreen
                api={api}
                actor={session.actor}
                ensureAccessToken={ensureAccessToken}
                isActive={screen === 'editProfile'}
                onCancel={() => setScreen(priorScreen)}
                onSaved={(actor) => {
                  setSession((current) =>
                    current === undefined ? current : { ...current, actor },
                  );
                  setScreen(priorScreen);
                }}
              />
            )}
            {screen === 'page' && pageTarget !== undefined && (
              <PageScreen
                api={api}
                handle={pageTarget.handle}
                initialSlug={pageTarget.slug}
                viewerActorId={session?.userId}
                ensureAccessToken={session === undefined ? undefined : ensureAccessToken}
                isActive={screen === 'page' && !pendingGo}
                onBack={() => setScreen(priorScreen)}
                env={env}
                draftStore={pageDraftStore}
                editorOptions={pageEditorOptions}
              />
            )}
            {screen === 'thread' && threadStack.length > 0 && (
              <ThreadScreen
                api={api}
                postId={threadStack[threadStack.length - 1] ?? ''}
                isActive={screen === 'thread' && !pendingGo}
                actions={rowActions}
                onBack={threadBack}
              />
            )}
            {screen === 'bookmarks' && session !== undefined && (
              <BookmarksScreen
                api={api}
                isActive={screen === 'bookmarks' && !pendingGo}
                ensureAccessToken={ensureAccessToken}
                actions={rowActions}
              />
            )}
            {screen === 'notifications' && session !== undefined && (
              <NotificationsScreen
                api={api}
                isActive={screen === 'notifications' && !pendingGo}
                ensureAccessToken={ensureAccessToken}
                onOpenPost={openThread}
                onOpenAuthor={(actor) => openProfile(actor.id, actor)}
                onMarkedAllRead={() => setUnreadNonce((current) => current + 1)}
              />
            )}
            {screen === 'report' && reportTarget !== undefined && session !== undefined && (
              <ReportScreen
                api={api}
                target={reportTarget}
                ensureAccessToken={ensureAccessToken}
                isActive={screen === 'report'}
                onCancel={() => setScreen(priorScreen)}
                onSubmitted={() => {
                  setNotice('Report submitted — thank you.');
                  setScreen(priorScreen);
                }}
              />
            )}
            {screen === 'accounts' && session !== undefined && (
              <AccountsScreen
                api={api}
                env={env}
                session={session}
                isActive={screen === 'accounts'}
                ensureAccessToken={ensureAccessToken}
                onLogout={() => void logout()}
                onResendVerification={() => void resendVerificationEmail()}
                onBack={() => setScreen(priorScreen)}
              />
            )}
            {screen === 'login' && (
              <LoginScreen
                api={api}
                sessionManager={sessionManager}
                env={env}
                isActive={screen === 'login'}
                onCancel={() => setScreen(priorScreen)}
                onSuccess={(newSession) => {
                  setSession(newSession);
                  setScreen(priorScreen);
                }}
              />
            )}
            {screen === 'compose' && session !== undefined && (
              <ComposeScreen
                api={api}
                draft={draft}
                onChange={updateDraft}
                onCancel={() => setScreen(priorScreen)}
                isActive={screen === 'compose'}
                ensureAccessToken={ensureAccessToken}
                onSubmitted={(post) => {
                  const cleared = emptyDraft();
                  setDraft(cleared);
                  void store.clear();
                  if (post.inReplyToId !== '') {
                    // A reply just posted — show its own thread (parent for context,
                    // itself in focus) rather than the author's whole timeline. Set
                    // directly (not `openThread`) so `priorScreen` — already the screen
                    // `r` was pressed from — survives for `Esc` to return to.
                    setThreadStack([post.id]);
                    setScreen('thread');
                  } else if (present(post.author)) {
                    openProfile(post.author.id, post.author);
                  } else if (session !== undefined) {
                    openProfile(session.userId, session.actor);
                  } else {
                    setScreen('profile');
                  }
                }}
              />
            )}
          </Box>

          <Box flexDirection="column" paddingX={1}>
            <Text color={theme.muted}>{'─'.repeat(Math.max(0, columns - 2))}</Text>
            {notice === undefined ? null : <Text color={theme.warn}>{notice}</Text>}
            <StatusBar
              target={api.target}
              status={statusLabel(serverInfoState.status)}
              statusColor={statusColor(serverInfoState.status)}
              handle={session?.actor?.handle}
              keys={statusKeys(screen, session !== undefined)}
              unreadCount={unreadCount}
            />
          </Box>
        </Box>
      </PlainModeProvider>
    </MediaSessionProvider>
  );
}

function statusKeys(screen: Screen, authenticated: boolean): string[] {
  if (screen === 'login') return ['Esc cancel'];
  if (screen === 'compose') return ['Ctrl+S post', 'Ctrl+A attach', 'Esc keep draft'];
  if (screen === 'search') return ['Enter search/open', 'Esc cancel'];
  if (screen === 'report') return ['j/k reason', 'Ctrl+S submit', 'Esc cancel'];
  if (screen === 'accounts') return ['a add key', 'x log out', 'Esc back'];
  if (screen === 'editProfile') return ['Tab/↑↓ move', 'Ctrl+S save', 'Esc cancel'];
  if (screen === 'notifications') return ['j/k move', 'Enter open', 'm mark all read'];
  if (screen === 'thread') {
    return [
      'Enter thread',
      'p author',
      'r reply',
      'l like',
      'b bookmark',
      'o open media',
      '! report',
      'Esc back',
    ];
  }
  if (screen === 'profile') {
    return [
      'j/k move',
      'Enter thread',
      'r reply',
      'l like',
      'b bookmark',
      'o open media',
      'v visit page',
      '! report',
      'g h/l/p go',
      '? help',
    ];
  }
  if (screen === 'local' || screen === 'home' || screen === 'bookmarks') {
    return [
      'j/k move',
      'Enter thread',
      'p author',
      'r reply',
      'l like',
      'b bookmark',
      'o open media',
      '! report',
      'g h/l/p go',
      '? help',
    ];
  }
  if (screen === 'page') {
    return [
      '[ / ] sub-page',
      'j/k select link',
      'Enter open link',
      'e edit',
      's sign guestbook',
      'Esc back',
    ];
  }
  const keys = [
    'g h/l/p go',
    'g b bookmarks',
    'g n notifications',
    'g v your page',
    '/ search',
    'c compose',
    authenticated ? 'L account' : 'L login',
    'P plain mode',
    '? help',
    'q quit',
  ];
  return keys;
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
