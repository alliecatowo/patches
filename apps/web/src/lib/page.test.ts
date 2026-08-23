import { describe, expect, it } from 'vitest';

import { safePageHref, safePageThemeColor } from './page.js';

describe('safePageThemeColor', () => {
  it('accepts hex, named, and functional colors', () => {
    expect(safePageThemeColor('#ff00aa')).toBe('#ff00aa');
    expect(safePageThemeColor('#f0a8')).toBe('#f0a8');
    expect(safePageThemeColor('rebeccapurple')).toBe('rebeccapurple');
    expect(safePageThemeColor('rgb(12, 34, 56)')).toBe('rgb(12, 34, 56)');
    expect(safePageThemeColor('hsla(120, 50%, 50%, 0.5)')).toBe('hsla(120, 50%, 50%, 0.5)');
  });

  it('rejects anything that is not a plain color value', () => {
    expect(safePageThemeColor('url(https://example.com/x.png)')).toBeNull();
    expect(safePageThemeColor('var(--something-else)')).toBeNull();
    // An escape byte can never reach this check from domain-parsed documents
    // (sanitizeText strips it) — this is the renderer's own second pass.
    expect(safePageThemeColor('red\x1b[31m')).toBeNull();
    expect(safePageThemeColor('')).toBeNull();
    expect(safePageThemeColor('   ')).toBeNull();
  });
});

describe('safePageHref', () => {
  it('allows http(s) only', () => {
    expect(safePageHref('https://example.com')).toBe('https://example.com');
    expect(safePageHref('http://example.com/a?b=c')).toBe('http://example.com/a?b=c');
    expect(safePageHref('javascript:alert(1)')).toBeNull();
    expect(safePageHref('data:text/plain,hi')).toBeNull();
    expect(safePageHref('not a url')).toBeNull();
  });
});
