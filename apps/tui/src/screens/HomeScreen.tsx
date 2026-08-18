import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { theme } from '../theme/index.js';

/**
 * `g h` — home feed. Fan-out-on-read across follows lands in Phase 3
 * (spec §137, §52); until then this is a placeholder rather than pretending
 * to be a feed with nothing in it.
 */
export function HomeScreen(): ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Home</Text>
      <Text color={theme.muted}>Home feed arrives with follows (Phase 3).</Text>
      <Text color={theme.muted}>Press &quot;g l&quot; for the local feed in the meantime.</Text>
    </Box>
  );
}
