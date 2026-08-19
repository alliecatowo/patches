import { describe, expect, it } from 'vitest';

import { resolveTheme } from './resolution.js';

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
