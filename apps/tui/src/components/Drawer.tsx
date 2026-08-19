import { Box, Text } from 'ink';
import type { ReactElement, ReactNode } from 'react';

import { ContentSizeProvider } from '../app/layout.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';

export interface DrawerProps {
  /** Exact columns the drawer occupies — already subtracted from the content region. */
  width: number;
  /** Exact rows, equal to the content region's height. */
  height: number;
  title: string;
  focused: boolean;
  children: ReactNode;
}

/**
 * A right-hand column beside the content region (`tui-interaction-model.md` §3.5).
 *
 * It publishes its *own* `ContentSizeProvider`, so whatever screen is hosted inside
 * measures against the drawer's 36 columns rather than the terminal's — that is what
 * lets the notifications screen be reused verbatim (read-on-view dwell logic included)
 * instead of a second, drifting drawer-only list.
 *
 * The frame invariant is untouched by opening one: the shell subtracts `DRAWER_COLUMNS`
 * from the content region *before* any split-pane arithmetic.
 */
export function Drawer({ width, height, title, focused, children }: DrawerProps): ReactElement {
  const bodyRows = Math.max(0, height - 2);
  const safeTitle = sanitizeForTerminal(title).replaceAll('\n', ' ');

  return (
    <Box width={width} height={height} flexDirection="row" flexShrink={0} overflow="hidden">
      <Box width={1} height={height} flexShrink={0} overflow="hidden">
        <Text color={theme.muted}>{Array.from({ length: height }, () => '│').join('\n')}</Text>
      </Box>
      <Box
        width={width - 1}
        height={height}
        flexDirection="column"
        flexShrink={0}
        overflow="hidden"
      >
        <Box width={width - 1} height={1} flexShrink={0} overflow="hidden">
          <Text color={focused ? theme.accent : theme.muted} wrap="truncate-end">
            {focused ? '>' : ' '} {safeTitle}
          </Text>
        </Box>
        <Box width={width - 1} height={1} flexShrink={0} overflow="hidden">
          <Text color={theme.muted}>{'─'.repeat(Math.max(0, width - 1))}</Text>
        </Box>
        {bodyRows > 0 ? (
          <Box
            width={width - 1}
            height={bodyRows}
            flexDirection="column"
            flexShrink={0}
            overflow="hidden"
          >
            <ContentSizeProvider size={{ rows: bodyRows, columns: width - 1 }}>
              {children}
            </ContentSizeProvider>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
