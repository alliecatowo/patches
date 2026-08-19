import { Text } from 'ink';
import type { ReactElement, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  message: string;
  kind: ToastKind;
}

/** 2.5s for info/success, 5s for error (§6 feedback) — long enough to read, short enough that a
 * toast never becomes chrome you have to dismiss. Exported for the timing test — driving the
 * real timer end-to-end through Ink's own effect/commit scheduling under fake timers is not
 * worth the flakiness it buys. */
export function autoClearMs(kind: ToastKind): number {
  return kind === 'error' ? 5000 : 2500;
}

const GLYPHS: Readonly<Record<ToastKind, string>> = {
  info: '·',
  success: '✓',
  error: '✗',
};

function colorFor(kind: ToastKind): string {
  switch (kind) {
    case 'info':
      return theme.warn;
    case 'success':
      return theme.ok;
    case 'error':
      return theme.error;
  }
}

/**
 * The in-app message line, just above the status bar: a like registering, a report
 * sent, a gRPC error. Auto-clears (`App` owns the timer) so it never becomes
 * permanent chrome. Plain mode drops the glyph, keeping the words (spec §173).
 */
export function ToastLine({ toast }: { toast: Toast | undefined }): ReactElement | null {
  const plain = usePlainMode();
  if (toast === undefined) return null;
  return (
    <Text color={colorFor(toast.kind)} wrap="truncate-end">
      {plain ? '' : `${GLYPHS[toast.kind]} `}
      {sanitizeForTerminal(toast.message)}
    </Text>
  );
}

export interface ToastQueue {
  readonly toast: Toast | undefined;
  /** Replaces whatever toast is currently showing — a queue of one, never a stack (§6: "a
   * second toast replaces the first rather than stacking"). */
  show(message: string, kind?: ToastKind): void;
  clear(): void;
}

const ToastQueueContext = createContext<ToastQueue | undefined>(undefined);

/**
 * Owns the toast queue-of-one and its auto-clear timer, so any screen can call `useToast()`
 * without App.tsx threading a `notify` callback through every prop list (P12-010). `App.tsx`'s
 * own hand-rolled `toast`/`setToast`/timer predates this and is left alone — this provider is
 * additive, for new call sites (this package's `PreferencesScreen`, in particular) and as the
 * migration target `app/App.tsx` can adopt later without changing `ToastLine`'s render contract.
 */
export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const [toast, setToast] = useState<Toast | undefined>(undefined);

  useEffect(() => {
    if (toast === undefined) return;
    const timer = setTimeout(() => setToast(undefined), autoClearMs(toast.kind));
    return () => clearTimeout(timer);
  }, [toast]);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ message, kind });
  }, []);
  const clear = useCallback(() => setToast(undefined), []);

  const value = useMemo<ToastQueue>(() => ({ toast, show, clear }), [toast, show, clear]);

  return <ToastQueueContext.Provider value={value}>{children}</ToastQueueContext.Provider>;
}

/** Throws outside a `ToastProvider` — a toast shown nowhere is a silent failure, not a
 * graceful no-op, so this fails loudly at the call site instead. */
export function useToast(): ToastQueue {
  const queue = useContext(ToastQueueContext);
  if (queue === undefined) throw new Error('useToast() must be used inside a ToastProvider');
  return queue;
}
