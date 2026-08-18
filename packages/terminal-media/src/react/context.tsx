import { createContext, useContext, type ReactNode } from 'react';

import type { TerminalMediaRenderer } from '../renderer.js';

const MediaRendererContext = createContext<TerminalMediaRenderer | undefined>(undefined);

export interface MediaRendererProviderProps {
  renderer: TerminalMediaRenderer;
  children: ReactNode;
}

/**
 * Makes one renderer available to every `<InlineImage>` below it.
 *
 * The renderer is created *before* `render()` (it depends on a stdin probe that Ink
 * would otherwise race), so it is passed in rather than constructed here.
 */
export function MediaRendererProvider({
  renderer,
  children,
}: MediaRendererProviderProps): ReactNode {
  return <MediaRendererContext.Provider value={renderer}>{children}</MediaRendererContext.Provider>;
}

/**
 * The renderer from the nearest `<MediaRendererProvider>`.
 *
 * @throws Error when used outside a provider — a missing provider is a wiring bug, not
 *   a reason to silently draw nothing.
 */
export function useMediaRenderer(): TerminalMediaRenderer {
  const renderer = useContext(MediaRendererContext);
  if (renderer === undefined) {
    throw new Error('useMediaRenderer() must be used inside <MediaRendererProvider>');
  }
  return renderer;
}

/** The renderer if one is in scope, otherwise `undefined`. */
export function useOptionalMediaRenderer(): TerminalMediaRenderer | undefined {
  return useContext(MediaRendererContext);
}
