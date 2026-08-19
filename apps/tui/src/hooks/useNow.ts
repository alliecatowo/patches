import { createContext, createElement, useContext, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

/** Interaction model §3.6/§6: "relative time ticks from one interval in the shell (30s),
 * published via context — never a timer per row." */
export const NOW_TICK_MS = 30_000;

const NowContext = createContext<Date | undefined>(undefined);

export interface NowProviderProps {
  children: ReactNode;
  /** Overrides the tick interval — tests only; production callers take the 30s default. */
  tickMs?: number;
}

/**
 * The one `Date.now()` interval for every relative timestamp in the app (`· 2m`, `· 3h`, a
 * post's `edited` line). Mount once at the shell; every `PostRow`/`Nameplate`/wherever else
 * reads {@link useNow} instead of calling `Date.now()` or starting its own timer — a thousand
 * row-level timers is how a scrolled list starts dropping frames.
 */
export function NowProvider({ children, tickMs = NOW_TICK_MS }: NowProviderProps): ReactElement {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(interval);
  }, [tickMs]);

  return createElement(NowContext.Provider, { value: now }, children);
}

/**
 * The shell's shared "now", refreshed every {@link NOW_TICK_MS}. Falls back to a fresh
 * `Date.now()` read outside a `NowProvider` (tests that render a single row in isolation, per
 * `docs/agents/LEARNINGS.md`'s guidance to test content-heavy subtrees directly) rather than
 * throwing — a stale relative time is a cosmetic bug, not a crash.
 */
export function useNow(): Date {
  const context = useContext(NowContext);
  return context ?? new Date();
}
