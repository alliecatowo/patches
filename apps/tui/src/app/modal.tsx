import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

export interface ModalControls {
  closeTop: () => void;
  clear: () => void;
}

export interface ModalEntry {
  id: string;
  title: string;
  /** The overlay box's width in cells; the shell centres it (P12-022). */
  columns?: number;
  /** The overlay box's height in cells. */
  rows?: number;
  /**
   * `float` (default) composites the overlay over a dimmed snapshot of the screen;
   * `takeover` fills the content region instead. The shell downgrades `float` to
   * `takeover` on its own at `narrow` width or `compact` height — a centred box under
   * 80 columns has nowhere to sit (`tui-interaction-model.md` §3.1).
   */
  presentation?: 'float' | 'takeover';
  render: (controls: ModalControls) => ReactNode;
}

export interface ModalStackController extends ModalControls {
  entries: readonly ModalEntry[];
  top: ModalEntry | undefined;
  push: (entry: ModalEntry) => void;
}

export function useModalStackController(): ModalStackController {
  const [entries, setEntries] = useState<readonly ModalEntry[]>([]);
  const closeTop = useCallback(() => setEntries((current) => current.slice(0, -1)), []);
  const clear = useCallback(() => setEntries([]), []);
  const push = useCallback((entry: ModalEntry) => {
    setEntries((current) => [...current.filter((candidate) => candidate.id !== entry.id), entry]);
  }, []);
  return useMemo(
    () => ({ entries, top: entries.at(-1), push, closeTop, clear }),
    [clear, closeTop, entries, push],
  );
}

const ModalStackContext = createContext<ModalStackController | undefined>(undefined);

export function ModalStackProvider({
  controller,
  children,
}: {
  controller: ModalStackController;
  children: ReactNode;
}): ReactElement {
  return <ModalStackContext.Provider value={controller}>{children}</ModalStackContext.Provider>;
}

export function useModalStack(): ModalStackController {
  const controller = useContext(ModalStackContext);
  if (controller === undefined)
    throw new Error('useModalStack must be used inside ModalStackProvider');
  return controller;
}

export function ModalHost({
  controller,
}: {
  controller: ModalStackController;
}): ReactElement | null {
  const top = controller.top;
  if (top === undefined) return null;
  return <>{top.render({ closeTop: controller.closeTop, clear: controller.clear })}</>;
}
