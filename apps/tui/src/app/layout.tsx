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

const InlineImagesContext = createContext(true);

/**
 * Whether inline Kitty placements are allowed right now.
 *
 * An open overlay sets this to `false` so every `InlineAttachment` unmounts and its
 * hook emits the terminal delete *before* the composited frame is painted — slicing a
 * unicode-placeholder row would corrupt the placement grid
 * (`docs/architecture/tui-interaction-model.md` §3.3). §2.6's identical-height rule
 * makes this free: the §75 fallback box occupies the same rows, so the frame does not
 * reflow when images come and go.
 */
export function InlineImagesProvider({
  allowed,
  children,
}: {
  allowed: boolean;
  children: ReactNode;
}): ReactElement {
  return <InlineImagesContext.Provider value={allowed}>{children}</InlineImagesContext.Provider>;
}

export function useInlineImagesAllowed(): boolean {
  return useContext(InlineImagesContext);
}
