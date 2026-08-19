import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { fitHints } from '../format/measure.js';
import { theme } from '../theme/index.js';

export interface StatusBarProps {
  target: string;
  /** Where you are, e.g. `Home` — the shell's only "current screen" label. */
  screenTitle: string;
  /** Short connection summary, e.g. `connected` or `offline`. */
  status: string;
  statusColor: string;
  /** Key hints, already ordered by usefulness. */
  keys: readonly string[];
  /** Signed-in actor's handle on this node, when there is a session (spec §169). */
  handle?: string | undefined;
  /** Unread notification count (P4-004, spec §56/§113) — `undefined` while signed
   * out or before the first `GetUnreadCount` resolves; `0` renders nothing (no badge
   * for "caught up"). */
  unreadCount?: number | undefined;
  /** Columns available. Both lines are hard-clipped to it — a status bar that
   * soft-wraps onto a second line is one of the ways the whole frame drifts. */
  width: number;
}

/** The persistent bottom bar: where you are, who you are, and what you can press. */
export function StatusBar({
  target,
  screenTitle,
  status,
  statusColor,
  keys,
  handle,
  unreadCount,
  width,
}: StatusBarProps): ReactElement {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box height={1} flexShrink={0} overflow="hidden">
        <Text color={theme.accent}>{screenTitle}</Text>
        <Text color={theme.muted}> · </Text>
        <Text color={statusColor}>{status}</Text>
        <Text color={theme.muted}> · {target}</Text>
        {handle === undefined ? null : <Text color={theme.accent}> · @{handle}</Text>}
        {unreadCount === undefined || unreadCount === 0 ? null : (
          <Text color={theme.warn}> · {unreadCount} unread</Text>
        )}
      </Box>
      <Box height={1} flexShrink={0} overflow="hidden">
        <Text color={theme.muted} wrap="truncate-end">
          {fitHints(keys, width)}
        </Text>
      </Box>
    </Box>
  );
}
