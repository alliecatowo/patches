import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';

const PlainModeContext = createContext(false);

export interface PlainModeProviderProps {
  plain: boolean;
  children: ReactNode;
}

/**
 * Spec §173: a nameplate renderer "MUST provide a plain mode that strips all
 * decoration" — colour, glyph, badges, avatar frame, profile border, status line.
 * A context (rather than threading a `plain` prop through every screen that renders
 * a `Nameplate`) because the decision is app-wide and the call sites are many
 * (`PostRow`, `SearchScreen`, `ProfileScreen`, `NotificationsScreen`, …).
 */
export function PlainModeProvider({ plain, children }: PlainModeProviderProps): ReactElement {
  return <PlainModeContext.Provider value={plain}>{children}</PlainModeContext.Provider>;
}

export function usePlainMode(): boolean {
  return useContext(PlainModeContext);
}
