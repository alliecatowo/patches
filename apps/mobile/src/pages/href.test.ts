import { describe, expect, it } from 'vitest';

import { safePageHref } from './href.js';

describe('safePageHref', () => {
  it('accepts http and https URLs, trimming surrounding whitespace', () => {
    expect(safePageHref('https://patches.example/wall')).toBe('https://patches.example/wall');
    expect(safePageHref('http://patches.example')).toBe('http://patches.example');
    expect(safePageHref('  https://patches.example  ')).toBe('https://patches.example');
  });

  it('rejects every other scheme', () => {
    expect(safePageHref('javascript:alert(1)')).toBeNull();
    expect(safePageHref('data:text/html;base64,AAAA')).toBeNull();
    expect(safePageHref('file:///etc/passwd')).toBeNull();
    expect(safePageHref('intent://x#Intent')).toBeNull();
  });

  it('rejects non-URLs and empty strings', () => {
    expect(safePageHref('')).toBeNull();
    expect(safePageHref('   ')).toBeNull();
    expect(safePageHref('just words')).toBeNull();
  });

  it('rejects URLs carrying control or escape bytes rather than repairing them', () => {
    expect(safePageHref('https://x.example/\u001B[2J')).toBeNull();
    expect(safePageHref('https://x.example/a\u0000b')).toBeNull();
  });
});
