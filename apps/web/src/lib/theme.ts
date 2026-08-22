/**
 * Client-side theme preference (P15-008, PWA & UX overhaul):
 * Supports the full Patches theme catalog: 'system', 'patches', 'dark', 'light',
 * 'paper', 'mono', 'hacker', 'pastel'.
 *
 * Persisted in `localStorage` and mirrored onto `<html data-theme>` and `<meta name="theme-color">`
 * so `index.css` selects the right CSS custom properties and the browser header matches seamlessly.
 * Never sent to the server — appearance is a cosmetic preference, and cosmetics never gate function (spec §184.3).
 */
export type ThemePreference =
  'system' | 'patches' | 'dark' | 'light' | 'paper' | 'mono' | 'hacker' | 'pastel';

export interface ThemeInfo {
  readonly id: ThemePreference;
  readonly name: string;
  readonly description: string;
  readonly preview: {
    readonly bg: string;
    readonly fg: string;
    readonly accent: string;
    readonly border: string;
  };
}

export const THEME_CATALOG: readonly ThemeInfo[] = [
  {
    id: 'system',
    name: 'Follow system',
    description: 'Matches your OS dark/light mode preference automatically.',
    preview: {
      bg: '#161b22',
      fg: '#e6edf3',
      accent: '#a78bfa',
      border: '#30363d',
    },
  },
  {
    id: 'patches',
    name: 'Patches',
    description: 'Signature deep purple midnight with neon violet and cyan accents.',
    preview: {
      bg: '#160f24',
      fg: '#f7f1ff',
      accent: '#d8a7ff',
      border: '#55336f',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Clean modern slate dark with purple highlights.',
    preview: {
      bg: '#0d1117',
      fg: '#e6edf3',
      accent: '#a78bfa',
      border: '#30363d',
    },
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Clean crisp daylight theme with deep royal purple.',
    preview: {
      bg: '#ffffff',
      fg: '#16181c',
      accent: '#6b46c1',
      border: '#d8dee4',
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Warm literary sepia parchment with rich espresso ink.',
    preview: {
      bg: '#f7f2e8',
      fg: '#26231f',
      accent: '#6a3dad',
      border: '#d7cae9',
    },
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'High-contrast stark terminal monochrome.',
    preview: {
      bg: '#000000',
      fg: '#ffffff',
      accent: '#ffffff',
      border: '#4a4a4a',
    },
  },
  {
    id: 'hacker',
    name: 'Hacker',
    description: 'Retro CRT phosphor green matrix terminal.',
    preview: {
      bg: '#001400',
      fg: '#d7ffd7',
      accent: '#00ff66',
      border: '#00cc55',
    },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    description: 'Soft cyberpunk dreamy lavender and mint.',
    preview: {
      bg: '#24203a',
      fg: '#fff8ff',
      accent: '#ffc2e2',
      border: '#5a4b78',
    },
  },
];

const STORAGE_KEY = 'patches.web.theme.v1';
const VALID_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'patches',
  'dark',
  'light',
  'paper',
  'mono',
  'hacker',
  'pastel',
];

const THEME_META_COLORS: Readonly<Record<ThemePreference, string>> = {
  system: '#160f24',
  patches: '#160f24',
  dark: '#0d1117',
  light: '#ffffff',
  paper: '#f7f2e8',
  mono: '#000000',
  hacker: '#001400',
  pastel: '#24203a',
};

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
    return 'system';
  }
}

function applyToDocument(preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', preference);

  // Sync meta theme-color for browser bar and PWA header
  let color = THEME_META_COLORS[preference];
  if (preference === 'system') {
    const dark = getSystemPrefersDark();
    color = dark ? THEME_META_COLORS.dark : THEME_META_COLORS.light;
  }
  const meta = document.getElementById('meta-theme-color');
  if (meta) {
    meta.setAttribute('content', color);
  }
}

let current: ThemePreference = readFromStorage();
const listeners = new Set<Listener>();

// Idempotent with inline pre-paint script
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
      // Best-effort persistence
    }
  }
  notify();
}

export function subscribeThemePreference(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function subscribeSystemColorScheme(listener: Listener): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (): void => {
    if (current === 'system') {
      applyToDocument('system');
    }
    listener();
  };
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}
