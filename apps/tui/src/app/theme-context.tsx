import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { BUILT_IN_THEMES } from '../theme/themes/registry.js';
import type { SemanticColorToken, ThemeDefinition } from '../theme/themes/types.js';

/**
 * The theme the shell resolved for this session (P12-101/P12-127).
 *
 * `theme/themes/*` is the pure registry — definitions, contrast validation, and the
 * `--theme` > `PATCHES_THEME` > local profile > actor profile > `patches` precedence
 * (`resolveTheme`). This context is the *runtime* half: one provider at the top of
 * `App`, so a screen can ask for a semantic token without every screen re-resolving
 * precedence or importing the registry.
 *
 * It deliberately lives under `app/` rather than `theme/`: the registry must stay
 * React-free so it can be unit-tested and reused by the CLI paths.
 */
const ActiveThemeContext = createContext<ThemeDefinition>(BUILT_IN_THEMES.patches);

export function ActiveThemeProvider({
  theme,
  children,
}: {
  theme: ThemeDefinition;
  children: ReactNode;
}): ReactElement {
  return <ActiveThemeContext.Provider value={theme}>{children}</ActiveThemeContext.Provider>;
}

export function useActiveTheme(): ThemeDefinition {
  return useContext(ActiveThemeContext);
}

/**
 * One semantic colour, or `undefined` when the theme delegates that token to the
 * user's own terminal palette (`null`) — `<Text color={undefined}>` inherits, which is
 * exactly the intent, so callers never need a branch.
 */
export function useThemeColor(token: SemanticColorToken): string | undefined {
  return useActiveTheme().colors[token] ?? undefined;
}
