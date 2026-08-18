import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { MIN_TERMINAL_SIZE, theme } from '../theme/index.js';

export interface TerminalTooSmallProps {
  columns: number;
  rows: number;
}

/**
 * Shown instead of the layout when the terminal is below the documented minimum
 * (spec §72) — a friendly message beats a destroyed layout.
 */
export function TerminalTooSmall({ columns, rows }: TerminalTooSmallProps): ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.warn}>This terminal is a little too small for Patches.</Text>
      <Text color={theme.muted}>
        Need at least {MIN_TERMINAL_SIZE.columns}x{MIN_TERMINAL_SIZE.rows}; this one is {columns}x
        {rows}.
      </Text>
      <Text color={theme.muted}>Resize the window and Patches will redraw itself.</Text>
    </Box>
  );
}
