import { describe, expect, it } from 'vitest';

import { assertSafeUrl, safeUrlSchema } from './url.js';

describe('safeUrlSchema', () => {
  const schema = safeUrlSchema(2048, 'link URL');

  it('accepts a plain https URL', () => {
    expect(schema.parse('https://example.com/path')).toBe('https://example.com/path');
  });

  it('accepts http (not just https)', () => {
    expect(schema.parse('http://example.com')).toBe('http://example.com');
  });

  it('accepts localhost (self-hosted node links, see LEARNINGS: zod-v4-url-validation)', () => {
    expect(schema.parse('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('rejects a non-http(s) scheme', () => {
    expect(() => schema.parse('javascript:alert(1)')).toThrow();
    expect(() => schema.parse('data:text/html,hi')).toThrow();
    expect(() => schema.parse('ftp://example.com/file')).toThrow();
    expect(() => schema.parse('file:///etc/passwd')).toThrow();
  });

  it('rejects a URL with embedded credentials', () => {
    expect(() => schema.parse('https://user:pass@example.com')).toThrow();
    expect(() => schema.parse('https://user@example.com')).toThrow();
  });

  it('rejects a URL over the length budget', () => {
    const long = `https://example.com/${'a'.repeat(3000)}`;
    expect(() => schema.parse(long)).toThrow();
  });

  it('rejects garbage input', () => {
    expect(() => schema.parse('not a url')).toThrow();
  });
});

describe('assertSafeUrl', () => {
  it('returns the trimmed URL when valid', () => {
    expect(assertSafeUrl('  https://example.com  ', 2048)).toBe('https://example.com');
  });

  it('throws on a disallowed scheme', () => {
    expect(() => assertSafeUrl('javascript:alert(1)', 2048)).toThrow();
  });

  it('throws on embedded credentials', () => {
    expect(() => assertSafeUrl('https://user:pass@example.com', 2048)).toThrow();
  });

  it('throws over the length budget', () => {
    expect(() => assertSafeUrl(`https://example.com/${'a'.repeat(3000)}`, 2048)).toThrow();
  });
});
