/** Client-only presentation preferences; appearance never gates product function. */
export type FanStyle = 'stacked' | 'radial';
export type DensityPreference = 'cozy' | 'compact';

const FAN_STYLE_STORAGE_KEY = 'patches.web.fan-style.v1';
const DENSITY_STORAGE_KEY = 'patches.web.density.v1';
const FAN_STYLES: readonly FanStyle[] = ['stacked', 'radial'];
const DENSITIES: readonly DensityPreference[] = ['cozy', 'compact'];
type Listener = () => void;

function readPreference<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value !== null && valid.includes(value as T) ? (value as T) : fallback;
  } catch {
    // Presentation preferences are best-effort when storage is unavailable.
    return fallback;
  }
}

function persistPreference(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Presentation preferences remain usable for the current session.
  }
}

let fanStyle: FanStyle = readPreference(FAN_STYLE_STORAGE_KEY, FAN_STYLES, 'stacked');
let density: DensityPreference = readPreference(DENSITY_STORAGE_KEY, DENSITIES, 'cozy');
const fanListeners = new Set<Listener>();
const densityListeners = new Set<Listener>();

function applyToDocument(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-fan-style', fanStyle);
  document.documentElement.setAttribute('data-density', density);
}

applyToDocument();

function handleStorage(event: StorageEvent): void {
  if (event.storageArea !== null && event.storageArea !== window.localStorage) return;

  if (event.key === null) {
    fanStyle = 'stacked';
    density = 'cozy';
    applyToDocument();
    for (const listener of fanListeners) listener();
    for (const listener of densityListeners) listener();
    return;
  }

  if (event.key === FAN_STYLE_STORAGE_KEY) {
    const next = event.newValue === null ? 'stacked' : event.newValue;
    if (!FAN_STYLES.includes(next as FanStyle)) return;
    fanStyle = next as FanStyle;
    applyToDocument();
    for (const listener of fanListeners) listener();
  }

  if (event.key === DENSITY_STORAGE_KEY) {
    const next = event.newValue === null ? 'cozy' : event.newValue;
    if (!DENSITIES.includes(next as DensityPreference)) return;
    density = next as DensityPreference;
    applyToDocument();
    for (const listener of densityListeners) listener();
  }
}

if (typeof window !== 'undefined') window.addEventListener('storage', handleStorage);

export function getFanStyle(): FanStyle {
  return fanStyle;
}
export function getDensityPreference(): DensityPreference {
  return density;
}

export function setFanStyle(value: FanStyle): void {
  fanStyle = value;
  persistPreference(FAN_STYLE_STORAGE_KEY, value);
  applyToDocument();
  for (const listener of fanListeners) listener();
}

export function setDensityPreference(value: DensityPreference): void {
  density = value;
  persistPreference(DENSITY_STORAGE_KEY, value);
  applyToDocument();
  for (const listener of densityListeners) listener();
}

export function subscribeFanStyle(listener: Listener): () => void {
  fanListeners.add(listener);
  return () => fanListeners.delete(listener);
}

export function subscribeDensityPreference(listener: Listener): () => void {
  densityListeners.add(listener);
  return () => densityListeners.delete(listener);
}
