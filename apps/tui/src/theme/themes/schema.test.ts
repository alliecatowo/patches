import { describe, expect, it } from 'vitest';

import { BUILT_IN_THEMES } from './registry.js';
import { parseUserTheme } from './schema.js';
import { SEMANTIC_COLOR_TOKENS } from './types.js';

function validColors(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const base = Object.fromEntries(SEMANTIC_COLOR_TOKENS.map((token) => [token, '#a855f7']));
  return { ...base, ...overrides };
}

describe('parseUserTheme', () => {
  it('accepts a fully specified theme and normalizes hex casing', () => {
    const result = parseUserTheme('sunset', {
      name: 'sunset',
      colors: validColors({ background: '#000000', accent: '#A855F7' }),
      preferredGlyphSet: 'ascii',
      backgroundMode: 'paint',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.name).toBe('sunset');
    expect(result.theme.colors.accent).toBe('#a855f7');
    expect(result.theme.preferredGlyphSet).toBe('ascii');
    expect(Object.keys(result.theme.colors)).toEqual(SEMANTIC_COLOR_TOKENS);
  });

  it('accepts null as a per-token terminal delegation', () => {
    const result = parseUserTheme('night', {
      name: 'night',
      colors: validColors({ background: null, foreground: null }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.colors.background).toBeNull();
  });

  it('defaults preferredGlyphSet and backgroundMode when omitted', () => {
    const result = parseUserTheme('bare', { name: 'bare', colors: validColors() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.preferredGlyphSet).toBe('unicode');
    expect(result.theme.backgroundMode).toBe('paint');
  });

  it('rejects a non-object payload without throwing', () => {
    expect(parseUserTheme('junk', 'not an object').ok).toBe(false);
    expect(parseUserTheme('junk', null).ok).toBe(false);
    expect(parseUserTheme('junk', 42).ok).toBe(false);
  });

  it('rejects a theme missing a semantic token', () => {
    const colors = validColors();
    delete colors.focus;
    const result = parseUserTheme('incomplete', { name: 'incomplete', colors });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('incomplete');
  });

  it('rejects an unknown key so a typo never silently becomes a no-op', () => {
    const result = parseUserTheme('typo', {
      name: 'typo',
      colors: validColors(),
      colours: 'oops',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-hex, non-null colour value', () => {
    const result = parseUserTheme('bad-color', {
      name: 'bad-color',
      colors: validColors({ accent: 'purple' }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('accent');
  });

  it('rejects a blank name', () => {
    expect(parseUserTheme('x', { name: '  ', colors: validColors() }).ok).toBe(false);
  });

  it('round-trips a built-in theme through the same shape', () => {
    const patches = BUILT_IN_THEMES.patches;
    const result = parseUserTheme('patches', {
      name: patches.name,
      colors: patches.colors,
      preferredGlyphSet: patches.preferredGlyphSet,
      backgroundMode: patches.backgroundMode,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.colors).toEqual(patches.colors);
  });
});
