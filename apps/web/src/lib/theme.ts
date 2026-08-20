/**
 * Client-side theme preference (P15-008): light, dark, or "follow system", persisted in
 * `localStorage` and mirrored onto `<html data-theme>` so `index.css` can select the right
 * CSS custom properties. Never sent to the server — appearance is a cosmetic preference, and
 * cosmetics never gate function (spec §184.3).
 *
 * The flash-of-wrong-theme problem is solved in two layers: an inline script in `index.html`
 * (which must agree with this module only on the storage key and the three valid values) sets
 * `data-theme` before first paint, and this module takes over from there so the rest of the app
 * can read/change the live preference through `useSyncExternalStore` (see `hooks/useTheme.ts`),
 * the same pattern `api/session.ts` uses for the signed-in actor.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'patches.web.theme.v1';
const VALID_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

type Listener = () => void;

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (VALID_PREFERENCES as readonly string[]).includes(value);
}

function readFromStorage(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    // Storage inaccessible (private browsing, disabled cookies) — a cosmetic preference must
    // never crash the app shell; fall back to the system default.
    return 'system';
  }
}

function applyToDocument(preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', preference);
}

let current: ThemePreference = readFromStorage();
const listeners = new Set<Listener>();

// Idempotent with the inline `index.html` script's pre-paint write — this just keeps the DOM
// attribute and this module's in-memory value from ever disagreeing.
applyToDocument(current);

function notify(): void {
  for (const listener of listeners) listener();
}

export function getThemePreference(): ThemePreference {
  return current;
}

export function setThemePreference(preference: ThemePreference): void {
  current = preference;
  applyToDocument(preference);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Best-effort persistence only; an unwritable store must not crash a theme change.
    }
  }
  notify();
}

export function subscribeThemePreference(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether the OS/browser currently reports a dark preference. `index.css` already tracks this
 * live via `@media (prefers-color-scheme: dark)` with no JS involved — this is only for UI copy
 * that wants to say what "system" currently resolves to (e.g. "Following system (dark)").
 */
export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function subscribeSystemColorScheme(listener: Listener): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
