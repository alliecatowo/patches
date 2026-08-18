import { randomUUID } from 'node:crypto';

import { Box, Text, useApp, useInput, useStdin, useWindowSize } from 'ink';
import { type ReactElement, useEffect, useRef, useState } from 'react';

import type { PatchesApi } from '../api/client.js';
import type { CredentialStore } from '../auth/credential-store.js';
import { SessionManager, type ActiveSession } from '../auth/session.js';
import { FileDraftStore, type ComposeDraft, type DraftStore } from '../compose/draft-store.js';
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
import { MIN_TERMINAL_SIZE, theme } from '../theme/index.js';

export interface AppProps {
  api: PatchesApi;
  credentialStore: CredentialStore;
  draftStore?: DraftStore;
  env?: NodeJS.ProcessEnv;
}

type Screen = 'connect' | 'help' | 'login' | 'compose' | 'profile' | 'local' | 'home';

/** Screens that own the keyboard entirely (text entry) — the app-level keymap steps aside. */
function capturesInput(screen: Screen): boolean {
  return screen === 'login' || screen === 'compose';
}

function emptyDraft(): ComposeDraft {
  return { body: '', clientRequestId: randomUUID() };
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

  const [store] = useState<DraftStore>(() => draftStore ?? new FileDraftStore());
  const [draft, setDraft] = useState<ComposeDraft>(emptyDraft);

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

  function updateDraft(next: ComposeDraft): void {
    setDraft(next);
    void store.save(next);
  }

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
      if (pendingGo) {
        setPendingGo(false);
        if (input === 'p') requireSession('profile');
        else if (input === 'l') go('local');
        else if (input === 'h') go('home');
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
        {screen === 'local' && <LocalScreen api={api} isActive={screen === 'local'} />}
        {screen === 'home' && <HomeScreen />}
        {screen === 'profile' && session !== undefined && (
          <ProfileScreen
            api={api}
            actorId={session.userId}
            knownActor={session.actor}
            isActive={screen === 'profile'}
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
            ensureAccessToken={() => sessionManager.ensureAccessToken()}
            onSubmitted={() => {
              const cleared = emptyDraft();
              setDraft(cleared);
              void store.clear();
              setScreen('profile');
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
  const keys = [
    'g h/l/p go',
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
