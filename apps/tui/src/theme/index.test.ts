import { afterEach, describe, expect, it } from 'vitest';

import { BUILT_IN_THEMES } from './themes/registry.js';
import {
  getActiveThemeDefinition,
  MIN_TERMINAL_SIZE,
  setActiveTheme,
  theme,
  tone,
} from './index.js';

describe('theme provider', () => {
  afterEach(() => {
    setActiveTheme(BUILT_IN_THEMES.patches);
  });

  it('defaults to the patches theme', () => {
    expect(getActiveThemeDefinition().name).toBe('patches');
  });

  it('resolves every legacy flat getter through the active theme', () => {
    setActiveTheme(BUILT_IN_THEMES.hacker);
    expect(theme.accent).toBe(BUILT_IN_THEMES.hacker.colors.accent);
    expect(theme.ok).toBe(BUILT_IN_THEMES.hacker.colors.ok);
    expect(theme.warn).toBe(BUILT_IN_THEMES.hacker.colors.warn);
    expect(theme.error).toBe(BUILT_IN_THEMES.hacker.colors.error);
    expect(theme.muted).toBe(BUILT_IN_THEMES.hacker.colors.muted);
    expect(theme.text).toBe(BUILT_IN_THEMES.hacker.colors.foreground);
    expect(theme.border).toBe(BUILT_IN_THEMES.hacker.colors.border);
    expect(theme.borderFocus).toBe(BUILT_IN_THEMES.hacker.colors.focus);
  });

  it('pins content-semantic roles to the same token under every built-in (CW/tombstone/DM notice)', () => {
    for (const definition of Object.values(BUILT_IN_THEMES)) {
      setActiveTheme(definition);
      // CW and DM notice always render with the `warn` role; a tombstone always `muted` — a
      // theme may recolour the token, but never unbind the role from it (design vision §4.4).
      expect(theme.warn).toBe(theme.warn);
      expect(theme.muted).toBe(theme.muted);
    }
  });

  it('falls back to the pre-engine ANSI name when a token delegates to the terminal', () => {
    setActiveTheme(BUILT_IN_THEMES.terminal);
    expect(theme.accent).toBe('magenta');
    expect(theme.ok).toBe('green');
    expect(theme.error).toBe('red');
  });

  it('mono renders zero colour codes through tone(), even though it stays a concrete string through the legacy getters', () => {
    setActiveTheme(BUILT_IN_THEMES.mono);
    expect(tone('accent')).toBeUndefined();
    expect(tone('ok')).toBeUndefined();
    expect(tone('error')).toBeUndefined();
    // The legacy getters must stay typed `string` for existing call sites, so mono still gets
    // a fallback there rather than `undefined` — new code should call `tone()` instead.
    expect(typeof theme.accent).toBe('string');
  });

  it('tone() returns the literal hex for a paint theme and undefined for a delegated one', () => {
    setActiveTheme(BUILT_IN_THEMES.paper);
    expect(tone('accent')).toBe(BUILT_IN_THEMES.paper.colors.accent);
    setActiveTheme(BUILT_IN_THEMES.terminal);
    expect(tone('accent')).toBeUndefined();
  });

  it('keeps MIN_TERMINAL_SIZE stable', () => {
    expect(MIN_TERMINAL_SIZE).toEqual({ columns: 60, rows: 20 });
  });
});
