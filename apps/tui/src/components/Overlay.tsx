import { Box, Text, renderToString } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { compositeBackground, placeOverlay, toRectangle } from '../app/overlay-composite.js';

export interface OverlayProps {
  /** The content region the overlay floats inside, in cells. */
  columns: number;
  rows: number;
  /** The overlay's own box. Clamped into the region by `placeOverlay`. */
  overlayColumns: number;
  overlayRows: number;
  /**
   * Element the frozen background snapshot is rendered from. Snapshotting is keyed on
   * `snapshotKey` so it happens once per open (and once per resize), never once per
   * keystroke: `renderToString` mounts a throw-away React root, and re-mounting the
   * timeline for every character typed into a quick post would be absurd.
   */
  background?: ReactNode;
  /** Pre-rendered background rows, when the caller already has them (tests). */
  backgroundLines?: readonly string[] | undefined;
  /** Changes when the snapshot must be re-taken: overlay identity, or a resize. */
  snapshotKey: string;
  /**
   * `narrow` width or `compact` height: a centred box has no room, so the overlay
   * takes the region over entirely — same component, cheaper path, still readable
   * (`docs/architecture/tui-interaction-model.md` §3.1/§3.3).
   */
  takeover: boolean;
  children: ReactNode;
}

/**
 * Floating overlay compositing (P12-022).
 *
 * Ink has no z-index. The background is snapshotted, padded to `columns`, dimmed and
 * sliced into an `above` / `left` / `right` / `below` frame around the overlay's
 * rectangle (`app/overlay-composite.ts`); the overlay itself is laid out live in the
 * hole, so unlike a fully composited overlay it can still own keys and state. Every
 * emitted row is exactly `columns` cells, which is the frame invariant the whole shell
 * rests on — `overlay-composite.test.ts` asserts it directly.
 *
 * The snapshot is taken from a `setTimeout(0)`, not during render and not directly in
 * the effect. `renderToString` mounts a *second* Ink root, and Ink 7.1.1's roots share
 * one `yoga-layout@3.2.1` WASM instance: computing the inner root's layout while the
 * outer root is still inside its own commit crashes the module outright with
 * `RuntimeError: table index is out of bounds` (reproduced 2026-08-19 —
 * `render-to-string.js` → `resetAfterCommit` → `calculateLayout`). Deferring the second
 * root to a macrotask puts it entirely outside the reconciler's work loop and the crash
 * goes away. The cost is that the first frame after opening shows the overlay alone;
 * Ink coalesces it away in practice.
 */
export function Overlay({
  columns,
  rows,
  overlayColumns,
  overlayRows,
  background,
  backgroundLines,
  snapshotKey,
  takeover,
  children,
}: OverlayProps): ReactElement {
  const placement = placeOverlay(columns, rows, overlayColumns, overlayRows);
  // Keyed rather than cleared from the effect: a stale snapshot is *derived* away
  // during render (`snapshot.key !== snapshotKey`), so nothing has to setState
  // synchronously inside an effect just to invalidate it.
  const [snapshot, setSnapshot] = useState<{ key: string; lines: readonly string[] } | undefined>(
    undefined,
  );

  useEffect(() => {
    if (takeover || background === undefined) return;
    const timer = setTimeout(() => {
      setSnapshot({
        key: snapshotKey,
        lines: toRectangle(renderToString(background, { columns }), columns, rows),
      });
    }, 0);
    return () => clearTimeout(timer);
    // `background` is a fresh element on every render, so including it would re-snapshot
    // continuously — `snapshotKey` is the caller's explicit "this is a different
    // background now" signal, which is the whole point of freezing it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed snapshot, see above
  }, [snapshotKey, columns, rows, takeover]);

  const lines = backgroundLines ?? (snapshot?.key === snapshotKey ? snapshot.lines : undefined);
  const composited = useMemo(
    () =>
      lines === undefined
        ? undefined
        : compositeBackground(toRectangle(lines.join('\n'), columns, rows), placement, columns),
    // `placement` is derived from the four numbers already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived placement, see above
    [lines, columns, rows, overlayColumns, overlayRows],
  );

  if (takeover || composited === undefined) {
    return (
      <Box width={columns} height={rows} flexDirection="column" flexShrink={0} overflow="hidden">
        {children}
      </Box>
    );
  }

  const rightWidth = columns - placement.left - placement.overlayColumns;

  return (
    <Box width={columns} height={rows} flexDirection="column" flexShrink={0} overflow="hidden">
      {composited.above.length > 0 ? (
        <Box width={columns} height={composited.above.length} flexShrink={0} overflow="hidden">
          <Text>{composited.above.join('\n')}</Text>
        </Box>
      ) : null}
      <Box
        width={columns}
        height={placement.overlayRows}
        flexDirection="row"
        flexShrink={0}
        overflow="hidden"
      >
        {placement.left > 0 ? (
          <Box width={placement.left} flexShrink={0} overflow="hidden">
            <Text>{composited.left.join('\n')}</Text>
          </Box>
        ) : null}
        <Box
          width={placement.overlayColumns}
          height={placement.overlayRows}
          flexDirection="column"
          flexShrink={0}
          overflow="hidden"
        >
          {children}
        </Box>
        {rightWidth > 0 ? (
          <Box width={rightWidth} flexShrink={0} overflow="hidden">
            <Text>{composited.right.join('\n')}</Text>
          </Box>
        ) : null}
      </Box>
      {composited.below.length > 0 ? (
        <Box width={columns} height={composited.below.length} flexShrink={0} overflow="hidden">
          <Text>{composited.below.join('\n')}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
