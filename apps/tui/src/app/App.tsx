import { randomUUID } from 'node:crypto';

import { Box, Text, useApp, useInput, useStdin, useWindowSize } from 'ink';
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import type { Actor, Post } from '@patches/proto';

import { present } from '../api/present.js';
import type { PatchesApi } from '../api/client.js';
import type { CredentialStore } from '../auth/credential-store.js';
import { SessionManager, type ActiveSession } from '../auth/session.js';
import { FileDraftStore, type ComposeDraft, type DraftStore } from '../compose/draft-store.js';
import type { PostRowActions } from '../components/PostList.js';
import { StatusBar } from '../components/StatusBar.js';
import { TerminalTooSmall } from '../components/TerminalTooSmall.js';
import { useServerInfo } from '../hooks/useServerInfo.js';
import { ComposeScreen } from '../screens/ComposeScreen.js';
import { ConnectScreen } from '../screens/ConnectScreen.js';
import { HelpScreen } from '../screens/HelpScreen.js';
import { LocalScreen } from '../screens/LocalScreen.js';
import { HomeScreen } from '../screens/HomeScreen.js';
import { LoginScreen } from '../screens/LoginScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { SearchScreen } from '../screens/SearchScreen.js';
import { ThreadScreen } from '../screens/ThreadScreen.js';
import { MIN_TERMINAL_SIZE, theme } from '../theme/index.js';

export interface AppProps {
  api: PatchesApi;
  credentialStore: CredentialStore;
  draftStore?: DraftStore;
  env?: NodeJS.ProcessEnv;
}

type Screen =
  'connect' | 'help' | 'login' | 'compose' | 'profile' | 'local' | 'home' | 'search' | 'thread';

/** Screens that own the keyboard entirely (text entry) — the app-level keymap steps aside. */
function capturesInput(screen: Screen): boolean {
  return screen === 'login' || screen === 'compose' || screen === 'search';
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
}: AppProps): ReactElement {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const { columns, rows } = useWindowSize();
  const { state: serverInfoState, retry: retryServerInfo } = useServerInfo(api);

  const [screen, setScreen] = useState<Screen>('connect');
  const [priorScreen, setPriorScreen] = useState<Screen>('connect');
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [pendingGo, setPendingGo] = useState(false);
  const pendingGoTimer = useRef<NodeJS.Timeout | undefined>(undefined);

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

  // Which actor `profile` currently shows — set by `g p` (the caller's own),
  // or by selecting a post's author (B-017). `undefined` until one of those fires.
  const [profileTarget, setProfileTarget] = useState<
    { actorId: string; knownActor: Actor | undefined } | undefined
  >(undefined);

  // Thread navigation (P4-004): a stack of post ids, top = the currently focused
  // thread. Drilling into a reply's own replies pushes; `Esc` pops one level and only
  // leaves `screen === 'thread'` once the stack empties (see `openThread`/`threadBack`).
  const [threadStack, setThreadStack] = useState<readonly string[]>([]);

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

  // `l`/`b` on a post row (P4-004). `ReactionService` (Like/Unlike/Bookmark/Unbookmark)
  // has not landed in `@patches/proto` yet — see the implementer report for this task.
  // These are placeholders so the keys are discoverable now; swap for real optimistic
  // calls once the service exists, same pattern as `toggleFollow` in `ProfileScreen`.
  function toggleLike(_post: Post): void {
    if (session === undefined) {
      setNotice('Log in first — press L.');
      return;
    }
    setNotice('Likes are coming soon.');
  }

  function toggleBookmark(_post: Post): void {
    if (session === undefined) {
      setNotice('Log in first — press L.');
      return;
    }
    setNotice('Bookmarks are coming soon.');
  }

  const rowActions: PostRowActions = {
    onOpenPost: (post) => openThread(post.id),
    onOpenAuthor: openAuthorProfile,
    onReply: openReply,
    onToggleLike: toggleLike,
    onToggleBookmark: toggleBookmark,
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
        if (session === undefined) go('login');
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
    <Box flexDirection="column" justifyContent="space-between" height={rows}>
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {screen === 'help' && <HelpScreen target={api.target} />}
        {screen === 'connect' && <ConnectScreen target={api.target} state={serverInfoState} />}
        {screen === 'local' && (
          <LocalScreen api={api} isActive={screen === 'local' && !pendingGo} actions={rowActions} />
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
        />
      </Box>
    </Box>
  );
}

function statusKeys(screen: Screen, authenticated: boolean): string[] {
  if (screen === 'login') return ['Esc cancel'];
  if (screen === 'compose') return ['Ctrl+S post', 'Esc keep draft'];
  if (screen === 'search') return ['Enter search/open', 'Esc cancel'];
  if (screen === 'thread') {
    return ['Enter thread', 'p author', 'r reply', 'l like', 'b bookmark', 'Esc back'];
  }
  if (screen === 'local' || screen === 'home' || screen === 'profile') {
    return [
      'j/k move',
      'Enter thread',
      'p author',
      'r reply',
      'l like',
      'b bookmark',
      'g h/l/p go',
      '? help',
    ];
  }
  const keys = [
    'g h/l/p go',
    '/ search',
    'c compose',
    authenticated ? 'L account' : 'L login',
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
