import { Box, Text, useApp, useInput, useStdin, useWindowSize } from 'ink';
import { type ReactElement, useState } from 'react';

import type { PatchesApi } from '../api/client.js';
import { StatusBar } from '../components/StatusBar.js';
import { TerminalTooSmall } from '../components/TerminalTooSmall.js';
import { useServerInfo } from '../hooks/useServerInfo.js';
import { ConnectScreen } from '../screens/ConnectScreen.js';
import { HelpScreen } from '../screens/HelpScreen.js';
import { MIN_TERMINAL_SIZE, theme } from '../theme/index.js';

export interface AppProps {
  api: PatchesApi;
}

export function App({ api }: AppProps): ReactElement {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const { columns, rows } = useWindowSize();
  const [showHelp, setShowHelp] = useState(false);
  const { state, retry } = useServerInfo(api);

  // `useInput` puts stdin into raw mode and *throws* where that is impossible —
  // piped stdin, CI, `patches | less`. Gating it on `isRawModeSupported` keeps
  // those environments rendering read-only instead of crashing to a React stack
  // trace (spec §81).
  useInput(
    (input) => {
      if (input === 'q') {
        exit();
        return;
      }
      if (input === '?') {
        setShowHelp((value) => !value);
        return;
      }
      if (input === 'R') retry();
    },
    { isActive: isRawModeSupported },
  );

  // Checked after the hooks, never before — hook order must not depend on size.
  if (columns < MIN_TERMINAL_SIZE.columns || rows < MIN_TERMINAL_SIZE.rows) {
    return <TerminalTooSmall columns={columns} rows={rows} />;
  }

  return (
    <Box flexDirection="column" justifyContent="space-between" height={rows}>
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {showHelp ? (
          <HelpScreen target={api.target} />
        ) : (
          <ConnectScreen target={api.target} state={state} />
        )}
      </Box>

      <Box flexDirection="column" paddingX={1}>
        <Text color={theme.muted}>{'─'.repeat(Math.max(0, columns - 2))}</Text>
        <StatusBar
          target={api.target}
          status={statusLabel(state.status)}
          statusColor={statusColor(state.status)}
          keys={['R reconnect', '? help', 'q quit']}
        />
      </Box>
    </Box>
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
