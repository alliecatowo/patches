import { describe, expect, it, vi } from 'vitest';

import { BUILT_IN_THEMES } from './registry.js';
import { resolveTheme, resolveThemeWithUserThemes } from './resolution.js';
import { SEMANTIC_COLOR_TOKENS, type AnyThemeDefinition } from './types.js';

describe('resolveTheme', () => {
  it.each([
    [
      { cliTheme: 'paper', envTheme: 'mono', localTheme: 'hacker', actorTheme: 'pastel' },
      'paper',
      'cli',
    ],
    [{ envTheme: 'mono', localTheme: 'hacker', actorTheme: 'pastel' }, 'mono', 'env'],
    [{ localTheme: 'hacker', actorTheme: 'pastel' }, 'hacker', 'local'],
    [{ actorTheme: 'pastel' }, 'pastel', 'actor'],
    [{}, 'patches', 'default'],
  ] as const)('uses each precedence branch %#', (input, expectedName, expectedSource) => {
    const result = resolveTheme(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.name).toBe(expectedName);
    expect(result.source).toBe(expectedSource);
  });

  it('treats blank values as absent', () => {
    const result = resolveTheme({ cliTheme: ' ', envTheme: '', localTheme: 'paper' });
    expect(result.ok && result.theme.name).toBe('paper');
  });

  it('returns an actionable error for an unknown highest-precedence name', () => {
    const result = resolveTheme({ cliTheme: 'midnight', envTheme: 'paper' });
    expect(result).toMatchObject({
      ok: false,
      invalidName: 'midnight',
      source: 'cli',
    });
    if (result.ok) return;
    expect(result.message).toContain('--theme');
    expect(result.message).toContain('patches, paper, mono, hacker, pastel, terminal');
  });

  it.each([
    [{ envTheme: 'unknown' }, 'env'],
    [{ localTheme: 'unknown' }, 'local'],
    [{ actorTheme: 'unknown' }, 'actor'],
  ] as const)('does not silently bypass unknown %s configuration', (input, source) => {
    const result = resolveTheme(input);
    expect(result).toMatchObject({ ok: false, source, invalidName: 'unknown' });
  });
});

describe('resolveThemeWithUserThemes', () => {
  const userTheme: AnyThemeDefinition = Object.freeze({
    name: 'sunset',
    colors: Object.freeze(
      Object.fromEntries(SEMANTIC_COLOR_TOKENS.map((token) => [token, '#123456'])),
    ) as AnyThemeDefinition['colors'],
    preferredGlyphSet: 'unicode',
    backgroundMode: 'paint',
  });

  it('resolves a built-in without ever touching the loader', async () => {
    const loader = vi.fn();
    const result = await resolveThemeWithUserThemes({ cliTheme: 'paper' }, loader);
    expect(loader).not.toHaveBeenCalled();
    expect(result.resolution).toMatchObject({ ok: true, theme: BUILT_IN_THEMES.paper });
    expect(result.invalidUserThemeMessage).toBeUndefined();
  });

  it('falls back to a user theme file when the name is not a built-in', async () => {
    const loader = vi.fn().mockResolvedValue({ ok: true, theme: userTheme });
    const result = await resolveThemeWithUserThemes({ cliTheme: 'sunset' }, loader);
    expect(loader).toHaveBeenCalledWith('sunset');
    expect(result.resolution).toMatchObject({ ok: true, theme: userTheme, source: 'cli' });
  });

  it('keeps the plain "unknown theme" error when no user theme file exists either', async () => {
    const loader = vi.fn().mockResolvedValue({ ok: false, notFound: true });
    const result = await resolveThemeWithUserThemes({ cliTheme: 'midnight' }, loader);
    expect(result.resolution).toMatchObject({ ok: false, invalidName: 'midnight' });
    expect(result.invalidUserThemeMessage).toBeUndefined();
  });

  it('falls back to the default theme with a toast message when the file exists but is invalid', async () => {
    const loader = vi
      .fn()
      .mockResolvedValue({ ok: false, message: 'Theme "broken" is not valid JSON.' });
    const result = await resolveThemeWithUserThemes({ cliTheme: 'broken' }, loader);
    expect(result.resolution).toMatchObject({
      ok: true,
      theme: BUILT_IN_THEMES.patches,
      source: 'default',
    });
    expect(result.invalidUserThemeMessage).toBe('Theme "broken" is not valid JSON.');
  });
});
