import { timestampToDate } from '@patches/proto';
import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import type { ServerInfoState } from '../hooks/useServerInfo.js';
import { theme } from '../theme/index.js';

export interface ConnectScreenProps {
  target: string;
  state: ServerInfoState;
}

/**
 * The first thing Patches shows: whether it can talk to the server at all.
 *
 * Pure presentation — the call itself lives in `useServerInfo` (spec §68).
 */
export function ConnectScreen({ target, state }: ConnectScreenProps): ReactElement {
  if (state.status === 'connecting') {
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>patches</Text>
        <Text color={theme.muted}>Connecting to {target}…</Text>
      </Box>
    );
  }

  if (state.status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color={theme.accent}>patches</Text>
        <Text color={theme.error}>{state.error.title}</Text>
        {state.error.hint === '' ? null : <Text color={theme.muted}>{state.error.hint}</Text>}
      </Box>
    );
  }

  const { info } = state;
  const serverTime = timestampToDate(info.serverTime);

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>patches</Text>
      <Text color={theme.ok}>Connected to {info.instanceName}.</Text>
      <Box marginTop={1} flexDirection="column">
        <Field
          label="server"
          value={`${info.serverVersion} (protocol v${String(info.protocolVersion)})`}
        />
        <Field label="min client" value={info.minClientVersion} />
        <Field label="server time" value={serverTime?.toISOString() ?? 'unknown'} />
        <Field
          label="features"
          value={info.features.length === 0 ? 'none' : info.features.join(', ')}
        />
      </Box>
    </Box>
  );
}

function Field({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <Box>
      <Box width={14}>
        <Text color={theme.muted}>{label}</Text>
      </Box>
      <Text>{value}</Text>
    </Box>
  );
}
