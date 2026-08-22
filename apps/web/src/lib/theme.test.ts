import { beforeEach, describe, expect, it } from 'vitest';

import {
  getThemePreference,
  setThemePreference,
  THEME_CATALOG,
  type ThemePreference,
} from './theme.js';

const STORAGE_KEY = 'patches.web.theme.v1';

describe('theme library', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setThemePreference('system');
  });

  it('exposes the complete catalog of 8 themes', () => {
    const ids = THEME_CATALOG.map((t) => t.id);
    expect(ids).toEqual([
      'system',
      'patches',
      'dark',
      'light',
      'paper',
      'mono',
      'hacker',
      'pastel',
    ]);
  });

  it('sets and persists theme preferences across the full catalog', () => {
    const themes: ThemePreference[] = [
      'patches',
      'dark',
      'light',
      'paper',
      'mono',
      'hacker',
      'pastel',
      'system',
    ];

    for (const theme of themes) {
      setThemePreference(theme);
      expect(getThemePreference()).toBe(theme);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(theme);
      expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
    }
  });

  it('updates meta-theme-color in DOM when theme changes', () => {
    const meta = document.createElement('meta');
    meta.id = 'meta-theme-color';
    meta.name = 'theme-color';
    document.head.appendChild(meta);

    setThemePreference('patches');
    expect(meta.getAttribute('content')).toBe('#160f24');

    setThemePreference('light');
    expect(meta.getAttribute('content')).toBe('#ffffff');

    setThemePreference('hacker');
    expect(meta.getAttribute('content')).toBe('#001400');

    meta.remove();
  });
});
