import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ReactElement } from 'react';

import { fitHints } from '../format/measure.js';
import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';

export type ConnectionState = 'connecting' | 'ready' | 'error';

export interface StatusBarProps {
  /** Node host, shown after the breadcrumb (spec §169: "who you are, where"). */
  target: string;
  /**
   * The full `patches › screen [› region]` path, already collapsed to the caller's
   * width-tier segment budget (`responsive-layout.ts#breadcrumbSegmentLimit`) — this
   * component only clips for *character* width, never for tier (design vision §2.1/§2.3:
   * "Focus is visible in the ribbon").
   */
  breadcrumb: readonly string[];
  connection: ConnectionState;
  /**
   * A manual refresh is in flight (P12-117's "finite refresh spinner"): replaces the
   * connection dot with a bounded spinner for exactly as long as the refresh takes —
   * never a second, independent loading indicator (design vision §6: "refreshes show
   * `⠋` in the ribbon's connection slot instead").
   */
  refreshing?: boolean | undefined;
  /** Signed-in actor's handle on this node, when there is a session (spec §169). */
  handle?: string | undefined;
  /** Unread notification count (P4-004, spec §56/§113) — `undefined` while signed
   * out or before the first `GetUnreadCount` resolves; `0` renders nothing (no badge
   * for "caught up"). */
  unreadCount?: number | undefined;
  /** Columns available. Hard-clipped to it — a status bar that soft-wraps onto a
   * second line is one of the ways the whole frame drifts. */
  width: number;
}

function connectionGlyph(connection: ConnectionState): string {
  switch (connection) {
    case 'ready':
      return '●';
    case 'connecting':
      return '◐';
    case 'error':
      return '○';
  }
}

function connectionWord(connection: ConnectionState): string {
  switch (connection) {
    case 'ready':
      return 'online';
    case 'connecting':
      return 'connecting';
    case 'error':
      return 'offline';
  }
}

function connectionColor(connection: ConnectionState): string {
  switch (connection) {
    case 'ready':
      return theme.ok;
    case 'connecting':
      return theme.warn;
    case 'error':
      return theme.error;
  }
}

/**
 * The persistent status line — the ribbon at row 0 in the `full` height tier, or the
 * bottom status row in `compact` (design vision §2.1, P12-102). One row: breadcrumb on
 * the left, connection/node/handle/unread on the right. {@link HintLine} is the
 * separate key-hints row, drawn wherever the caller decides it belongs.
 */
export function StatusBar({
  target,
  breadcrumb,
  connection,
  refreshing = false,
  handle,
  unreadCount,
  width,
}: StatusBarProps): ReactElement {
  const plain = usePlainMode();
  const path = breadcrumb.join(plain ? ' > ' : ' › ');

  return (
    <Box height={1} flexShrink={0} overflow="hidden" width={width}>
      <Text wrap="truncate-end">
        <Text color={theme.accent}>{path}</Text>
        <Text color={theme.muted}> · </Text>
        {refreshing && !plain ? (
          <Text color={theme.muted}>
            <Spinner type="dots" />
          </Text>
        ) : (
          <Text color={connectionColor(connection)}>
            {plain ? connectionWord(connection) : connectionGlyph(connection)}
          </Text>
        )}
        <Text color={theme.muted}> {target}</Text>
        {handle === undefined ? null : <Text color={theme.accent}> · @{handle}</Text>}
        {unreadCount === undefined || unreadCount === 0 ? null : (
          <Text color={theme.warn}>
            {' '}
            · {plain ? `${String(unreadCount)} unread` : `✉ ${String(unreadCount)}`}
          </Text>
        )}
      </Text>
    </Box>
  );
}

export interface HintLineProps {
  keys: readonly string[];
  width: number;
}

/** The key-hints row — split out of {@link StatusBar} so a ribbon at row 0 and this row
 * at the bottom can be composited independently (P12-102's budget-neutral layout). */
export function HintLine({ keys, width }: HintLineProps): ReactElement {
  return (
    <Box height={1} flexShrink={0} overflow="hidden">
      <Text color={theme.muted} wrap="truncate-end">
        {fitHints(keys, width)}
      </Text>
    </Box>
  );
}
