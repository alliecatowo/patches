import { Box, Text, useInput, type Key } from 'ink';
import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import stringWidth from 'string-width';

import { movementTarget, type ListJump } from '../app/list-movement.js';
import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';
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
  /**
   * Per-row glyph prefix (e.g. a thread's `↳` depth marker), rendered dim before the
   * row's own content. Reserves its own width from `width` per row, same invariant as
   * {@link showScrollThumb} — a glyph that draws columns the measurement didn't reserve
   * would let a body wrap differently than it was measured.
   */
  rowGlyph?: ((item: T, index: number) => string) | undefined;
  /**
   * A dim labelled rule rendered above the item at `beforeIndex` (e.g. a thread's
   * `── replies ──` divider before the first reply). The rule is part of that row's
   * own budget: it adds one measured row to `heights[beforeIndex]`, so the viewport
   * never lets it overflow the frame.
   */
  sectionRule?: { label: string; beforeIndex: number } | undefined;
  /** Shown instead of the list when `items` is empty. */
  empty?: ReactNode;
  /** Rendered at the end of the `n/total ↑ above ↓ below` line. */
  positionSuffix?: string;
  /** Rendered at the *start* of that same line, so a caller's own marker (e.g. the
   * timeline's `↑ 3 new`) costs no extra row. */
  positionPrefix?: ReactNode;
  /** Set false for a list whose owner draws its own position/status line. */
  showPosition?: boolean;
  /**
   * Reserves a 1-column gutter (taken out of `width`, not added to it — the P12-117
   * width invariant every existing caller depends on) for a proportional scroll thumb
   * alongside the rendered rows. Opt-in and ignored in plain mode, where a visual
   * scrollbar is exactly the decoration `usePlainMode` strips.
   */
  showScrollThumb?: boolean | undefined;
  /**
   * Prefixes every rendered row with its 1-based position (`[1]`, `[2]`, …) — P12-118's
   * linear/screen-reader mode, where a viewer without colour or a persistent cursor
   * still needs a stable way to refer to "item 3". Reserves its own width up front from
   * `width`, same invariant as {@link showScrollThumb}.
   */
  indexed?: boolean | undefined;
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
  rowGlyph,
  sectionRule,
  empty,
  positionSuffix,
  positionPrefix,
  showPosition = true,
  showScrollThumb,
  indexed,
}: VirtualListProps<T>): ReactElement {
  const plain = usePlainMode();
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

  // Both gutters are opt-in and taken *out of* `width`, never added to it — the
  // invariant every existing caller's own row measurement already depends on.
  const thumbEnabled = showScrollThumb === true && !plain;
  const indexWidth = indexed === true ? `[${String(items.length)}]`.length + 1 : 0;
  const rowWidth = Math.max(1, width - (thumbEnabled ? 1 : 0) - indexWidth);
  const glyphOf = (item: T, index: number): string => rowGlyph?.(item, index) ?? '';
  const glyphWidthOf = (item: T, index: number): number => {
    const g = glyphOf(item, index);
    return g === '' ? 0 : stringWidth(g) + 1;
  };
  const heights = items.map((item, index) =>
    measure(
      item,
      Math.max(1, rowWidth - (indentOf?.(item, index) ?? 0) * 2 - glyphWidthOf(item, index)),
      index,
    ),
  );
  // The section rule is part of the row it precedes — one extra measured row so the
  // viewport never lets it overflow the frame (the same invariant as the row itself).
  if (
    sectionRule !== undefined &&
    sectionRule.beforeIndex >= 0 &&
    sectionRule.beforeIndex < heights.length
  ) {
    const ruleIndex = sectionRule.beforeIndex;
    heights[ruleIndex] = (heights[ruleIndex] ?? 0) + 1;
  }
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
      <Box flexDirection="row" flexShrink={0} height={rowBudget} overflow="hidden">
        <Box flexDirection="column" flexShrink={0} height={rowBudget} overflow="hidden">
          {visible.map((item, offset) => {
            const index = viewport.start + offset;
            const indent = (indentOf?.(item, index) ?? 0) * 2;
            const glyphText = glyphOf(item, index);
            const glyphWidth = glyphWidthOf(item, index);
            return (
              <Box key={keyOf(item, index)} flexShrink={0} flexDirection="column">
                {sectionRule !== undefined && index === sectionRule.beforeIndex ? (
                  <Text color={theme.muted}>── {sectionRule.label} ──</Text>
                ) : null}
                <Box flexDirection="row" marginLeft={indent}>
                  {indexed === true ? (
                    <Text color={theme.muted}>{`[${String(index + 1)}]`.padEnd(indexWidth)}</Text>
                  ) : null}
                  {glyphText !== '' ? <Text color={theme.muted}>{glyphText} </Text> : null}
                  {renderItem(item, {
                    index,
                    selected: isActive && index === selected,
                    width: Math.max(1, rowWidth - indent - glyphWidth),
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
        {thumbEnabled ? (
          <Box width={1} height={rowBudget} flexShrink={0} overflow="hidden">
            <Text color={theme.muted}>
              {scrollThumbRows(rowBudget, items.length, viewport.start, viewport.end)
                .map((filled) => (filled ? '█' : '│'))
                .join('\n')}
            </Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

/**
 * The scroll thumb's track, one boolean per row (P12-117): `true` where the thumb
 * covers that row. Pure and exported so the proportions are unit-testable without
 * rendering — `trackRows` is the rows budget, `total` the item count, `start`/`end`
 * the on-screen window (`viewport.start`/`viewport.end`).
 */
export function scrollThumbRows(
  trackRows: number,
  total: number,
  start: number,
  end: number,
): boolean[] {
  if (trackRows <= 0 || total <= 0) return [];
  const visibleCount = Math.max(1, end - start);
  if (visibleCount >= total) return Array.from({ length: trackRows }, () => true);
  const thumbSize = Math.max(
    1,
    Math.min(trackRows, Math.round((trackRows * visibleCount) / total)),
  );
  const maxStart = Math.max(0, trackRows - thumbSize);
  const thumbStart = Math.max(0, Math.min(maxStart, Math.round((trackRows * start) / total)));
  return Array.from(
    { length: trackRows },
    (_, row) => row >= thumbStart && row < thumbStart + thumbSize,
  );
}
