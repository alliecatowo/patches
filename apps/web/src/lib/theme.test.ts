import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSystemPrefersDark,
  getThemePreference,
  setThemePreference,
  subscribeSystemColorScheme,
  subscribeThemePreference,
} from './theme.js';

const STORAGE_KEY = 'patches.web.theme.v1';

describe('theme preference storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setThemePreference('system');
  });

  it('persists a choice to localStorage and applies it to <html data-theme>', () => {
    setThemePreference('dark');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('notifies subscribers on every change', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeThemePreference(() => seen.push(getThemePreference()));

    setThemePreference('light');
    setThemePreference('dark');
    unsubscribe();
    setThemePreference('system');

    expect(seen).toEqual(['light', 'dark']);
  });

  it('re-reads a previously stored choice on a fresh module load (simulated page reload)', async () => {
    setThemePreference('dark');
    // The real flash-of-wrong-theme fix lives in index.html's inline script (which runs before
    // this module ever loads); this exercises the module's own half — `readFromStorage()` at
    // import time — by forcing a fresh module instance to re-read `localStorage`, the same way
    // a real page load would after the inline script already wrote the attribute.
    vi.resetModules();
    const reloaded = await import('./theme.js');
    expect(reloaded.getThemePreference()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('treats a corrupt or unrecognized stored value as "system" rather than throwing', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'sepia');
    vi.resetModules();
    const reloaded = await import('./theme.js');
    expect(reloaded.getThemePreference()).toBe('system');
  });
});

describe('system color scheme tracking ("follow system")', () => {
  it('reports the live OS/browser preference and updates when the media query changes', () => {
    const listeners = new Set<() => void>();
    let matches = false;
    const fakeMediaQueryList = {
      get matches() {
        return matches;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    } as unknown as MediaQueryList;

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(fakeMediaQueryList));

    try {
      expect(getSystemPrefersDark()).toBe(false);

      const notifications: boolean[] = [];
      const unsubscribe = subscribeSystemColorScheme(() =>
        notifications.push(getSystemPrefersDark()),
      );

      matches = true;
      for (const listener of listeners) listener();

      expect(notifications).toEqual([true]);
      unsubscribe();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
