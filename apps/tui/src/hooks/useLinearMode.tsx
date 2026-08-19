import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';

const LinearModeContext = createContext(false);

export interface LinearModeProviderProps {
  linear: boolean;
  children: ReactNode;
}

/**
 * P12-118's linear/screen-reader mode — one column, no overlays/drawers (full-screen
 * takeovers instead), indexed list rows, plain mode implied. A context, the same shape
 * as `theme/plain-mode.tsx`'s `PlainModeProvider`, so a screen that wants to number its
 * rows (`VirtualList`'s `indexed` prop) doesn't need `App.tsx` to thread a `linearMode`
 * prop through every call site between here and there.
 */
export function LinearModeProvider({ linear, children }: LinearModeProviderProps): ReactElement {
  return <LinearModeContext.Provider value={linear}>{children}</LinearModeContext.Provider>;
}

export function useLinearMode(): boolean {
  return useContext(LinearModeContext);
}
