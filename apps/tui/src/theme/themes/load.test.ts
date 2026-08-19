import { describe, expect, it, vi } from 'vitest';

import { listUserThemeNames, loadUserTheme, type ThemeLoadOperations } from './load.js';
import { SEMANTIC_COLOR_TOKENS } from './types.js';

function validThemeJson(name: string): string {
  const colors = Object.fromEntries(SEMANTIC_COLOR_TOKENS.map((token) => [token, '#123456']));
  return JSON.stringify({ name, colors });
}

function enoent(): NodeJS.ErrnoException {
  const error = new Error('not found') as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  return error;
}

describe('loadUserTheme', () => {
  it('reads, parses, and validates a theme file', async () => {
    const operations: ThemeLoadOperations = {
      readFile: vi.fn().mockResolvedValue(validThemeJson('sunset')),
      readdir: vi.fn(),
    };
    const result = await loadUserTheme('sunset', operations);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.name).toBe('sunset');
    expect(operations.readFile).toHaveBeenCalledWith(
      expect.stringContaining('themes/sunset.json'),
      'utf8',
    );
  });

  it('reports "not found" for a missing file without throwing', async () => {
    const operations: ThemeLoadOperations = {
      readFile: vi.fn().mockRejectedValue(enoent()),
      readdir: vi.fn(),
    };
    const result = await loadUserTheme('missing', operations);
    expect(result).toMatchObject({ ok: false, notFound: true });
  });

  it('returns an actionable message for invalid JSON instead of throwing', async () => {
    const operations: ThemeLoadOperations = {
      readFile: vi.fn().mockResolvedValue('{ not json'),
      readdir: vi.fn(),
    };
    const result = await loadUserTheme('broken', operations);
    expect(result.ok).toBe(false);
    if (result.ok || 'notFound' in result) return;
    expect(result.message).toContain('broken');
  });

  it('returns an actionable message for JSON that fails schema validation', async () => {
    const operations: ThemeLoadOperations = {
      readFile: vi.fn().mockResolvedValue(JSON.stringify({ name: 'x' })),
      readdir: vi.fn(),
    };
    const result = await loadUserTheme('x', operations);
    expect(result.ok).toBe(false);
  });

  it('surfaces an unexpected read error rather than swallowing it', async () => {
    const operations: ThemeLoadOperations = {
      readFile: vi.fn().mockRejectedValue(new Error('permission denied')),
      readdir: vi.fn(),
    };
    const result = await loadUserTheme('locked', operations);
    expect(result).toMatchObject({ ok: false });
  });
});

describe('listUserThemeNames', () => {
  it('lists only *.json entries, sorted, with the extension stripped', async () => {
    const operations: ThemeLoadOperations = {
      readFile: vi.fn(),
      readdir: vi.fn().mockResolvedValue(['sunset.json', 'README.md', 'aurora.json']),
    };
    expect(await listUserThemeNames(operations)).toEqual(['aurora', 'sunset']);
  });

  it('returns an empty list when the directory does not exist yet', async () => {
    const operations: ThemeLoadOperations = {
      readFile: vi.fn(),
      readdir: vi.fn().mockRejectedValue(enoent()),
    };
    expect(await listUserThemeNames(operations)).toEqual([]);
  });
});
