import { Text } from 'ink';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';

export interface BannerProps {
  /** A short reason, e.g. `FriendlyError.title` — "Can't reach the Patches server at …". */
  title: string;
  /** Epoch ms of the next scheduled auto-retry (`useServerInfo`'s `retryAt`), or `undefined`
   * for a banner with no countdown (a non-retryable failure — `Ctrl+R` is still offered, it
   * just isn't on a clock). */
  retryAt: number | undefined;
}

function secondsUntil(target: number, now: number): number {
  return Math.max(0, Math.ceil((target - now) / 1000));
}

/**
 * The reserved notice row's offline/reconnect state (§6 feedback): `title` plus a live
 * `retrying in Ns` countdown and the `Ctrl+R` hint. Ticks on its own 1s interval, deliberately
 * separate from `useNow`'s 30s "relative time" clock — a countdown a viewer is staring at
 * needs second granularity, and this is the one banner in the app, not a per-row timer.
 */
export function Banner({ title, retryAt }: BannerProps): ReactElement {
  const plain = usePlainMode();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (retryAt === undefined) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [retryAt]);

  const countdown =
    retryAt === undefined ? undefined : `retrying in ${String(secondsUntil(retryAt, now))}s`;
  const hint = plain ? 'Ctrl+R to retry' : 'Ctrl+R retry';

  return (
    <Text color={theme.error} wrap="truncate-end">
      {plain ? '' : '● '}
      {title}
      {countdown === undefined ? '' : ` — ${countdown}`} · {hint}
    </Text>
  );
}
