import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { detectPastedImagePaths } from './paste-attach.js';

describe('detectPastedImagePaths', () => {
  it('accepts a bare absolute path', () => {
    expect(detectPastedImagePaths('/home/a/pic.jpg')).toEqual(['/home/a/pic.jpg']);
  });

  it('accepts a file:// URI and decodes it', () => {
    expect(detectPastedImagePaths('file:///home/a/my%20pic.png')).toEqual(['/home/a/my pic.png']);
  });

  it('accepts a quoted path containing spaces', () => {
    expect(detectPastedImagePaths(`'/home/a/my pic.webp'`)).toEqual(['/home/a/my pic.webp']);
    expect(detectPastedImagePaths(`"/home/a/my pic.jpeg"`)).toEqual(['/home/a/my pic.jpeg']);
  });

  it('expands a leading ~ against the home directory', () => {
    expect(detectPastedImagePaths('~/pics/pic.png')).toEqual([join(homedir(), 'pics/pic.png')]);
    expect(detectPastedImagePaths('~')).toEqual(null); // "~" alone is not an image path
  });

  it('accepts a multi-line list of paths (multi-file drop)', () => {
    expect(detectPastedImagePaths('/a/one.jpg\n/a/two.png\n"/a/three four.webp"')).toEqual([
      '/a/one.jpg',
      '/a/two.png',
      '/a/three four.webp',
    ]);
  });

  it('rejects an unquoted line with internal whitespace as prose, not a path', () => {
    expect(detectPastedImagePaths('check out my new pic.png ok')).toBeNull();
  });

  it('rejects a non-image extension', () => {
    expect(detectPastedImagePaths('/home/a/notes.txt')).toBeNull();
  });

  it('rejects a relative path', () => {
    expect(detectPastedImagePaths('pic.png')).toBeNull();
  });

  it('rejects plain prose and URLs', () => {
    expect(detectPastedImagePaths('https://example.com/pic.png')).toBeNull();
    expect(detectPastedImagePaths('hey check this out')).toBeNull();
  });

  it('rejects a NUL byte', () => {
    expect(detectPastedImagePaths('/home/a/pic\0.png')).toBeNull();
  });

  it('returns null for empty paste', () => {
    expect(detectPastedImagePaths('   \n  ')).toBeNull();
  });

  it('rejects a mixed list where only some lines are paths', () => {
    expect(detectPastedImagePaths('/a/one.png\nhere is some prose too')).toBeNull();
  });
});
