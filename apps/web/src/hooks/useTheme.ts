import { useSyncExternalStore } from 'react';

import {
  getSystemPrefersDark,
  getThemePreference,
  setThemePreference,
  subscribeSystemColorScheme,
  subscribeThemePreference,
  type ThemePreference,
} from '../lib/theme.js';

export interface UseThemeResult {
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
}

/** The user's theme preference (light/dark/system) and a setter, backed by `lib/theme.ts`. */
export function useTheme(): UseThemeResult {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreference,
    () => 'system' as const,
  );
  return { preference, setPreference: setThemePreference };
}

/** Live OS/browser dark-mode preference, for showing what "system" currently resolves to. */
export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(subscribeSystemColorScheme, getSystemPrefersDark, () => false);
}
