import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';

/**
 * The size of the shell's content area, in terminal cells.
 *
 * The whole app is laid out to an exact budget: `rows` split between a clipped
 * content box and a fixed-height footer, never "however tall the tree happens to
 * be". A frame taller than the terminal is what makes Ink's line diff drift and
 * smear every subsequent redraw (see `format/measure.ts`), so the budget is
 * published here rather than each list guessing from `useWindowSize`.
 */
export interface ContentSize {
  rows: number;
  columns: number;
}

const ContentSizeContext = createContext<ContentSize | undefined>(undefined);

export function ContentSizeProvider({
  size,
  children,
}: {
  size: ContentSize;
  children: ReactNode;
}): ReactElement {
  return <ContentSizeContext.Provider value={size}>{children}</ContentSizeContext.Provider>;
}

/** The content budget, or a conservative default when rendered outside the shell
 * (component unit tests render screens directly). */
export function useContentSize(): ContentSize {
  return useContext(ContentSizeContext) ?? { rows: 16, columns: 80 };
}

/** Rows the footer always occupies: separator, message line, status line, hint line. */
export const FOOTER_ROWS = 4;
