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
}

/** The persistent bottom bar: where you are, and what you can press. */
export function StatusBar({ target, status, statusColor, keys }: StatusBarProps): ReactElement {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={statusColor}>{status}</Text>
        <Text color={theme.muted}> · {target}</Text>
      </Box>
      <Text color={theme.muted}>{keys.join('   ')}</Text>
    </Box>
  );
}
