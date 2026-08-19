import { join, sep } from 'node:path';

import stringWidth from 'string-width';
import { describe, expect, it } from 'vitest';

import {
  clipPickerLine,
  completePath,
  completionContext,
  extensionPolicyError,
  filterAndSortEntries,
  inferMimeType,
  mimePolicyError,
  parsePathInput,
  resolvePathInput,
} from './file-picker-model.js';

describe('file picker path parsing', () => {
  it('expands only a leading ~/ and leaves env/command syntax literal', () => {
    expect(parsePathInput('~/photo.png', '/home/alice')).toEqual({
      ok: true,
      path: join('/home/alice', 'photo.png'),
    });
    expect(parsePathInput('~alice/photo.png', '/home/alice')).toEqual({
      ok: true,
      path: '~alice/photo.png',
    });
    expect(parsePathInput('$HOME/photo.png', '/home/alice')).toEqual({
      ok: true,
      path: '$HOME/photo.png',
    });
    expect(parsePathInput('$(touch nope)', '/home/alice')).toEqual({
      ok: true,
      path: '$(touch nope)',
    });
  });

  it('decodes safe file URIs and rejects malformed, ambiguous, and NUL paths', () => {
    expect(parsePathInput('file:///tmp/a%20photo.png', '/home/alice')).toEqual({
      ok: true,
      path: '/tmp/a photo.png',
    });
    expect(parsePathInput('file:///tmp/photo.png?download=1', '/home/alice')).toEqual({
      ok: false,
      error: 'File URIs cannot contain a query or fragment.',
    });
    expect(parsePathInput('file:///tmp/a%2Fphoto.png', '/home/alice')).toEqual({
      ok: false,
      error: 'That file:// URI is not valid.',
    });
    expect(parsePathInput('photo\0.png', '/home/alice')).toEqual({
      ok: false,
      error: 'Paths cannot contain a NUL byte.',
    });
  });

  it('resolves relative text without interpreting shell syntax', () => {
    expect(resolvePathInput('$HOME/picture.png', '/work', '/home/alice')).toEqual({
      ok: true,
      path: join('/work', '$HOME/picture.png'),
    });
  });
});

describe('file picker filtering and completion', () => {
  const entries = [
    { name: 'zeta.png', kind: 'file' as const },
    { name: 'Beta', kind: 'directory' as const },
    { name: '.secret.png', kind: 'file' as const },
    { name: 'alpha.png', kind: 'file' as const },
    { name: 'aardvark', kind: 'directory' as const },
    { name: 'socket', kind: 'other' as const },
    { name: 'ALPHA.png', kind: 'file' as const },
  ];

  it('hides dotfiles by default, excludes special entries, and sorts deterministically', () => {
    expect(filterAndSortEntries(entries, false)).toEqual([
      { name: 'aardvark', kind: 'directory' },
      { name: 'Beta', kind: 'directory' },
      { name: 'ALPHA.png', kind: 'file' },
      { name: 'alpha.png', kind: 'file' },
      { name: 'zeta.png', kind: 'file' },
    ]);
    expect(filterAndSortEntries(entries, true).map((entry) => entry.name)).toContain('.secret.png');
  });

  it('completes one directory with a separator and multiple matches to their common prefix', () => {
    const directory = join(sep, 'tmp', 'picker');
    expect(
      completePath({ directory, fragment: 'be' }, [{ name: 'Beta', kind: 'directory' }]),
    ).toEqual({ value: `${join(directory, 'Beta')}${sep}`, matchCount: 1 });
    expect(
      completePath({ directory, fragment: 'pho' }, [
        { name: 'Photo-one.png', kind: 'file' },
        { name: 'photo-two.png', kind: 'file' },
      ]),
    ).toEqual({ value: join(directory, 'Photo-'), matchCount: 2 });
    expect(completionContext('~/pho', '/work', '/home/alice')).toEqual({
      directory: '/home/alice',
      fragment: 'pho',
    });
  });
});

describe('file picker policy and terminal bounds', () => {
  it('applies case-insensitive extension and exact/wildcard MIME policies', () => {
    expect(extensionPolicyError('/tmp/photo.JPEG', ['jpg', '.jpeg'])).toBeNull();
    expect(extensionPolicyError('/tmp/photo.txt', ['png'])).toContain('Extension .txt');
    expect(inferMimeType('/tmp/photo.JPEG')).toBe('image/jpeg');
    expect(inferMimeType('/tmp/custom.foo', { foo: 'image/custom' })).toBe('image/custom');
    expect(mimePolicyError('image/png', ['image/*'])).toBeNull();
    expect(mimePolicyError('text/plain', ['image/png'])).toContain('text/plain');
    expect(mimePolicyError(undefined, ['image/*'])).toContain('could not be determined');
  });

  it('makes control characters visible and clips every line to the cell budget', () => {
    const clipped = clipPickerLine('photo\u001B[2J界界界.png', 12);
    expect(clipped).not.toContain('\u001B');
    expect(clipped).toContain('?');
    expect(stringWidth(clipped)).toBeLessThanOrEqual(12);
  });
});
