import { Box, Text, useInput, type Key } from 'ink';
import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { movementTarget, type ListJump } from '../app/list-movement.js';
import { theme } from '../theme/index.js';
import { computeViewport, resolveTopIndex } from './list-viewport.js';

export interface VirtualRowState {
  index: number;
  selected: boolean;
  /** Cells this row may draw into, already net of its indent. */
  width: number;
}

export interface VirtualListProps<T> {
  items: readonly T[];
  /** Stable identity per item — React keys, and nothing else. */
  keyOf: (item: T, index: number) => string;
  /**
   * The row's exact height at `width`, in terminal cells. This is *the* measurement
   * path: the viewport, the `Ctrl+D` page size and the frame budget are all derived
   * from it, so a row that draws more rows than it measures is what smears Ink's line
   * diff. Every caller ships a test that renders a row and counts its lines.
   */
  measure: (item: T, width: number, index: number) => number;
  renderItem: (item: T, state: VirtualRowState) => ReactNode;
  /** Cells available to the widest row. */
  width: number;
  /** Rows available to the items themselves, excluding the position line. */
  budget: number;
  /** Whether this list currently owns the keyboard. */
  isActive?: boolean;
  /** `g g` / `G` arriving from the shell, which owns the `g` prefix. */
  jump?: ListJump | undefined;
  /** Fires whenever the selection moves, so a screen can mirror it for its own chrome. */
  onSelectionChange?: ((index: number, item: T | undefined) => void) | undefined;
  /** Fires when the rendered window changes — read-on-view and lazy loading hang off it. */
  onViewportChange?: ((start: number, end: number) => void) | undefined;
  /**
   * Keys this list does not own. Handled *after* movement, with the selected item
   * already resolved; return `true` when consumed.
   */
  onKey?: ((input: string, key: Key, item: T | undefined, index: number) => boolean) | undefined;
  /** Per-row indent level (0 = flush left), e.g. a thread indenting replies. */
  indentOf?: ((item: T, index: number) => number) | undefined;
  /** Shown instead of the list when `items` is empty. */
  empty?: ReactNode;
  /** Rendered at the end of the `n/total ↑ above ↓ below` line. */
  positionSuffix?: string;
  /** Rendered at the *start* of that same line, so a caller's own marker (e.g. the
   * timeline's `↑ 3 new`) costs no extra row. */
  positionPrefix?: ReactNode;
  /** Set false for a list whose owner draws its own position/status line. */
  showPosition?: boolean;
}

export interface VirtualListPosition {
  index: number;
  total: number;
  above: number;
  below: number;
}

/**
 * The one measured, virtualized list in the app (P12-004).
 *
 * Timelines, notifications, the help reference, search results, conversations,
 * communities and tags all scroll the same way, page the same way and are bounded the
 * same way — because they are all this component. Before it there were four different
 * windowing implementations (two measured, two "assume every row is one line"), and the
 * unmeasured ones were free to render past the frame budget.
 *
 * Selection lives here rather than in each screen: a list that does not own its own
 * cursor cannot keep the cursor visible while the window moves.
 */
export function VirtualList<T>({
  items,
  keyOf,
  measure,
  renderItem,
  width,
  budget,
  isActive = false,
  jump,
  onSelectionChange,
  onViewportChange,
  onKey,
  indentOf,
  empty,
  positionSuffix,
  positionPrefix,
  showPosition = true,
}: VirtualListProps<T>): ReactElement {
  // The applied jump nonce travels with the selection so `g g` is *derived* during
  // render rather than written back from an effect — the same rule the rest of this
  // codebase follows.
  const [selection, setSelection] = useState<{ index: number; jumpNonce: number; top: number }>({
    index: 0,
    jumpNonce: 0,
    top: 0,
  });

  const maxIndex = Math.max(items.length - 1, 0);
  const pendingJump = jump !== undefined && jump.nonce !== selection.jumpNonce ? jump : undefined;
  const selected =
    pendingJump === undefined
      ? Math.min(selection.index, maxIndex)
      : pendingJump.edge === 'top'
        ? 0
        : maxIndex;

  const rowWidth = Math.max(1, width);
  const heights = items.map((item, index) =>
    measure(item, Math.max(1, rowWidth - (indentOf?.(item, index) ?? 0) * 2), index),
  );
  const rowBudget = Math.max(1, budget);
  const topIndex = resolveTopIndex(selection.top, selected, heights, rowBudget);
  const viewport = computeViewport(topIndex, heights, rowBudget);
  const visible = items.slice(viewport.start, viewport.end);

  function select(index: number): void {
    setSelection({ index, jumpNonce: jump?.nonce ?? 0, top: topIndex });
    onSelectionChange?.(index, items[index]);
  }

  // External sync, not derived state: a screen that marks notifications read on view
  // needs to know which rows are actually on screen, and only this component knows.
  useEffect(() => {
    onViewportChange?.(viewport.start, viewport.end);
    // `onViewportChange` is a fresh closure every render; re-firing on it would defeat
    // the debounce every caller wraps around this.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [viewport.start, viewport.end]);

  useInput(
    (input, key) => {
      if (items.length > 0) {
        const moved = movementTarget({
          input,
          key,
          current: selected,
          total: items.length,
          pageSize: Math.max(1, viewport.end - viewport.start),
        });
        if (moved !== undefined) {
          select(moved);
          return;
        }
      }
      // Still dispatched for an empty list: `n`/`space` (load more) and a screen's own
      // verbs must not stop working just because the first page came back empty.
      onKey?.(input, key, items[selected], selected);
    },
    // Deliberately not `isActive && items.length > 0`: Ink only subscribes a `useInput`
    // while `isActive` is true, and a list always renders once empty before its first
    // page arrives — gating on the item count left a freshly opened list deaf until
    // some other state change flipped the flag back on.
    { isActive },
  );

  if (items.length === 0) {
    return <>{empty ?? <Text color={theme.muted}>Nothing here yet.</Text>}</>;
  }

  return (
    <Box flexDirection="column" flexShrink={0} overflow="hidden">
      {showPosition ? (
        <Box flexShrink={0}>
          {positionPrefix}
          <Text color={theme.muted} wrap="truncate-end">
            {viewport.above > 0 ? `↑ ${String(viewport.above)} above  ` : ''}
            {selected + 1}/{items.length}
            {viewport.below > 0 ? `  ↓ ${String(viewport.below)} below` : ''}
            {positionSuffix ?? ''}
          </Text>
        </Box>
      ) : null}
      <Box flexDirection="column" flexShrink={0} height={rowBudget} overflow="hidden">
        {visible.map((item, offset) => {
          const index = viewport.start + offset;
          const indent = (indentOf?.(item, index) ?? 0) * 2;
          return (
            <Box key={keyOf(item, index)} flexShrink={0} marginLeft={indent}>
              {renderItem(item, {
                index,
                selected: isActive && index === selected,
                width: Math.max(1, rowWidth - indent),
              })}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
