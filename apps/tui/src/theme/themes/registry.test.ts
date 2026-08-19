import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_THEMES,
  listBuiltInThemes,
  READABLE_TEXT_CONTRAST,
  validateThemeContrast,
} from './registry.js';
import { BUILT_IN_THEME_NAMES, SEMANTIC_COLOR_TOKENS, scopeDecorationColors } from './types.js';

describe('built-in theme registry', () => {
  it('contains exactly the six named built-ins with every semantic token', () => {
    expect(listBuiltInThemes().map((theme) => theme.name)).toEqual(BUILT_IN_THEME_NAMES);
    for (const theme of listBuiltInThemes()) {
      expect(Object.keys(theme.colors)).toEqual(SEMANTIC_COLOR_TOKENS);
      expect(theme.preferredGlyphSet).toMatch(/^(unicode|nerd|ascii)$/);
    }
  });

  it('meets the readable-text threshold for every explicit foreground/background pair', () => {
    for (const theme of listBuiltInThemes()) {
      const validation = validateThemeContrast(theme);
      expect(validation.failures, theme.name).toEqual([]);
      expect(validation.ok, theme.name).toBe(true);
      for (const check of validation.checks) {
        if (check.ratio !== null)
          expect(check.ratio).toBeGreaterThanOrEqual(READABLE_TEXT_CONTRAST);
      }
    }
  });

  it('delegates the terminal theme entirely to terminal-owned foreground/background colors', () => {
    expect(BUILT_IN_THEMES.terminal.backgroundMode).toBe('terminal');
    expect(Object.values(BUILT_IN_THEMES.terminal.colors).every((color) => color === null)).toBe(
      true,
    );
    expect(
      validateThemeContrast(BUILT_IN_THEMES.terminal).checks.every(
        (check) => check.delegatedToTerminal,
      ),
    ).toBe(true);
  });

  it('keeps mono meaningful when color and decoration are stripped', () => {
    expect(BUILT_IN_THEMES.mono.preferredGlyphSet).toBe('ascii');
    expect(BUILT_IN_THEMES.mono.colors.foreground).not.toBe(BUILT_IN_THEMES.mono.colors.background);
  });

  it('keeps wall and nameplate colors scoped away from immutable shell colors', () => {
    const shell = BUILT_IN_THEMES.patches.colors;
    const scoped = scopeDecorationColors(shell, {
      wall: { background: '#ffffff', foreground: '#000000' },
      nameplate: { foreground: '#00ff00' },
    });

    expect(scoped.shell).toBe(shell);
    expect(scoped.shell.background).toBe('#160f24');
    expect(scoped.decoration.wall.background).toBe('#ffffff');
    expect(Object.isFrozen(scoped.shell)).toBe(true);
    expect(Object.isFrozen(scoped.decoration.wall)).toBe(true);
  });
});
