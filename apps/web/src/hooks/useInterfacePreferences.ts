import { useSyncExternalStore } from 'react';

import {
  getDensityPreference,
  getFanStyle,
  setDensityPreference,
  setFanStyle,
  subscribeDensityPreference,
  subscribeFanStyle,
  type DensityPreference,
  type FanStyle,
} from '../lib/interfacePreferences.js';

export interface UseInterfacePreferencesResult {
  readonly fanStyle: FanStyle;
  readonly density: DensityPreference;
  readonly setFanStyle: (style: FanStyle) => void;
  readonly setDensity: (density: DensityPreference) => void;
}

/** Client-only visual choices, kept separate from accounts and server capabilities. */
export function useInterfacePreferences(): UseInterfacePreferencesResult {
  const fanStyle = useSyncExternalStore(subscribeFanStyle, getFanStyle, () => 'stacked' as const);
  const density = useSyncExternalStore(
    subscribeDensityPreference,
    getDensityPreference,
    () => 'cozy' as const,
  );
  return { fanStyle, density, setFanStyle, setDensity: setDensityPreference };
}
