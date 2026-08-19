import { Text } from 'ink';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';

export interface BannerProps {
  /** A short reason, e.g. `FriendlyError.title` — "Can't reach the Patches server at …". */
  title: string;
  /** `FriendlyError.hint` — what to do about it. Interaction model §6: "Render `hint` in the
   * notice row — today only `title` is used." Omitted (or empty) when there's nothing useful
   * to add beyond the title. */
  hint?: string;
  /** Epoch ms of the next scheduled auto-retry (`useServerInfo`'s `retryAt`), or `undefined`
   * for a banner with no countdown (a non-retryable failure — `Ctrl+R` is still offered, it
   * just isn't on a clock). */
  retryAt: number | undefined;
}

function secondsUntil(target: number, now: number): number {
  return Math.max(0, Math.ceil((target - now) / 1000));
}

/**
 * The reserved notice row's offline/reconnect state (§6 feedback): `title` (plus `hint`, when
 * given) and a live `retrying in Ns` countdown and the `Ctrl+R` hint. Ticks on its own 1s
 * interval, deliberately separate from `useNow`'s 30s "relative time" clock — a countdown a
 * viewer is staring at needs second granularity, and this is the one banner in the app, not a
 * per-row timer.
 */
export function Banner({ title, hint, retryAt }: BannerProps): ReactElement {
  const plain = usePlainMode();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (retryAt === undefined) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [retryAt]);

  const countdown =
    retryAt === undefined ? undefined : `retrying in ${String(secondsUntil(retryAt, now))}s`;
  const retryHint = plain ? 'Ctrl+R to retry' : 'Ctrl+R retry';

  return (
    <Text color={theme.error} wrap="truncate-end">
      {plain ? '' : '● '}
      {title}
      {hint === undefined || hint === '' ? '' : ` ${hint}`}
      {countdown === undefined ? '' : ` — ${countdown}`} · {retryHint}
    </Text>
  );
}

export interface StickyNewCountProps {
  /** How many new items arrived since the last read (`usePaginatedList.refresh()`'s
   * `newCount`). Render nothing at `0` — the caller decides whether to mount this at all. */
  count: number;
  /** Bound to whatever key clears it on this screen — `g g`/`Ctrl+R` per the interaction
   * model, shown so the pill teaches its own dismissal the way every other hint does. */
  clearHint?: string;
}

/**
 * The sticky `↑ N new` pill promoted from `usePaginatedList.refresh()`'s existing `newCount`
 * (P12-010/P12-105) — a single row pinned above the list content, `accent`-coloured, cleared by
 * `g g`/`Ctrl+R`. A pill, not the offline `Banner` above: same file (design vision's P12-105
 * table), different shape, so it's exported separately rather than folded into one component
 * with a `kind` prop that would make both halves harder to read.
 */
export function StickyNewCount({
  count,
  clearHint = 'g g',
}: StickyNewCountProps): ReactElement | null {
  const plain = usePlainMode();
  if (count <= 0) return null;
  const glyph = plain ? '^' : '↑';
  return (
    <Text color={theme.accent} wrap="truncate-end">
      {glyph} {String(count)} new · {clearHint}
    </Text>
  );
}
