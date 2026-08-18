import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { theme } from '../theme/index.js';
import { TUI_VERSION } from '../version.js';

const BINDINGS: ReadonlyArray<readonly [string, string]> = [
  ['R', 'reconnect to the server'],
  ['?', 'toggle this help'],
  ['q', 'quit Patches'],
  ['Ctrl+C', 'quit Patches'],
];

/**
 * Keybindings must stay discoverable (spec §69). This screen is the discovery
 * surface; the full keymap lives in docs/architecture/tui.md.
 */
export function HelpScreen({ target }: { target: string }): ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>patches {TUI_VERSION}</Text>
      <Text color={theme.muted}>server: {target}</Text>
      <Box marginTop={1} flexDirection="column">
        {BINDINGS.map(([key, description]) => (
          <Box key={key}>
            <Box width={10}>
              <Text color={theme.warn}>{key}</Text>
            </Box>
            <Text color={theme.muted}>{description}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
