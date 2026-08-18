import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { theme } from '../theme/index.js';

export interface StatusBarProps {
  target: string;
  /** Short connection summary, e.g. `connected` or `offline`. */
  status: string;
  statusColor: string;
  /** Key hints, already ordered by usefulness. */
  keys: readonly string[];
  /** Signed-in actor's handle on this node, when there is a session (spec §169). */
  handle?: string | undefined;
}

/** The persistent bottom bar: where you are, who you are, and what you can press. */
export function StatusBar({
  target,
  status,
  statusColor,
  keys,
  handle,
}: StatusBarProps): ReactElement {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={statusColor}>{status}</Text>
        <Text color={theme.muted}> · {target}</Text>
        {handle === undefined ? null : <Text color={theme.accent}> · @{handle}</Text>}
      </Box>
      <Text color={theme.muted}>{keys.join('   ')}</Text>
    </Box>
  );
}
