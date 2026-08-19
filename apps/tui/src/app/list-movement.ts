import type { Key } from 'ink';

/**
 * One movement vocabulary for every list in the app — timelines, thread replies,
 * notifications, search results, the page block editor.
 *
 * Owner feedback (2026-08-18): movement has to be the same everywhere, arrow keys
 * included. So this is a pure function rather than five hand-rolled `useInput`
 * bodies that each support a slightly different subset.
 *
 * | keys                    | moves            |
 * | ----------------------- | ---------------- |
 * | `j` / `↓`               | one down         |
 * | `k` / `↑`               | one up           |
 * | `Ctrl+D` / `PageDown`   | half a page down |
 * | `Ctrl+U` / `PageUp`     | half a page up   |
 * | `G`                     | last item        |
 *
 * `g g` (first item) can't live here: `g` is the shell's own prefix, so `App`
 * handles it and hands the result down as a `ListJump` (see `PostList`).
 */
export interface MovementInput {
  input: string;
  key: Key;
  /** Current selection index. */
  current: number;
  /** Number of items in the list. */
  total: number;
  /** How many rows are on screen — half of this is the `Ctrl+D`/`Ctrl+U` step. */
  pageSize: number;
}

function clamp(index: number, total: number): number {
  return Math.min(Math.max(index, 0), Math.max(total - 1, 0));
}

/**
 * The index this keypress selects, or `undefined` when the keypress isn't a
 * movement at all (so the caller can go on to handle it).
 */
export function movementTarget({
  input,
  key,
  current,
  total,
  pageSize,
}: MovementInput): number | undefined {
  if (total === 0) return undefined;
  const half = Math.max(1, Math.floor(pageSize / 2));

  if (input === 'j' || key.downArrow) return clamp(current + 1, total);
  if (input === 'k' || key.upArrow) return clamp(current - 1, total);
  if (key.pageDown || (key.ctrl && input === 'd')) return clamp(current + half, total);
  if (key.pageUp || (key.ctrl && input === 'u')) return clamp(current - half, total);
  if (input === 'G') return total - 1;
  return undefined;
}

/**
 * `g g` / `G`-style jumps that the shell (not the list) received. The `nonce` is
 * what makes a repeat of the same jump take effect — lists compare it against the
 * one they last applied, deriving the selection during render rather than writing
 * it back from an effect.
 */
export interface ListJump {
  edge: 'top' | 'bottom';
  nonce: number;
}
