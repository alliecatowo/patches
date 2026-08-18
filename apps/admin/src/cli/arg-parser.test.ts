import { describe, expect, it } from 'vitest';

import {
  booleanOption,
  optionalIntOption,
  optionalStringOption,
  parseArgs,
  parseIsoDate,
  requirePositional,
  requireStringOption,
} from './arg-parser.js';

describe('parseArgs', () => {
  it('splits positionals and --flag value pairs', () => {
    const result = parseArgs(['user', 'suspend', 'alice', '--reason', 'spam', '--as', 'mod']);
    expect(result.positionals).toEqual(['user', 'suspend', 'alice']);
    expect(result.options).toEqual({ reason: 'spam', as: 'mod' });
  });

  it('treats a --flag with no value (or followed by another flag) as boolean true', () => {
    const result = parseArgs(['invite', 'list', '--json', '--verbose']);
    expect(result.positionals).toEqual(['invite', 'list']);
    expect(result.options).toEqual({ json: true, verbose: true });
  });

  it('keeps the last value when a flag is repeated', () => {
    const result = parseArgs(['--reason', 'first', '--reason', 'second']);
    expect(result.options.reason).toBe('second');
  });

  it('returns empty positionals/options for an empty argv', () => {
    expect(parseArgs([])).toEqual({ positionals: [], options: {} });
  });
});

describe('requireStringOption', () => {
  it('returns the value when present', () => {
    expect(requireStringOption({ reason: 'spam' }, 'reason')).toBe('spam');
  });

  it('throws when missing', () => {
    expect(() => requireStringOption({}, 'reason')).toThrow('--reason is required.');
  });

  it('throws when passed as a bare boolean flag', () => {
    expect(() => requireStringOption({ reason: true }, 'reason')).toThrow('--reason is required.');
  });
});

describe('optionalStringOption', () => {
  it('returns undefined when absent', () => {
    expect(optionalStringOption({}, 'note')).toBeUndefined();
  });

  it('returns the string value when present', () => {
    expect(optionalStringOption({ note: 'ok' }, 'note')).toBe('ok');
  });

  it('throws for a bare boolean flag', () => {
    expect(() => optionalStringOption({ note: true }, 'note')).toThrow('--note needs a value.');
  });
});

describe('optionalIntOption', () => {
  it('parses a positive integer', () => {
    expect(optionalIntOption({ 'max-uses': '5' }, 'max-uses')).toBe(5);
  });

  it('returns undefined when absent', () => {
    expect(optionalIntOption({}, 'max-uses')).toBeUndefined();
  });

  it('rejects zero, negative, and non-numeric values', () => {
    expect(() => optionalIntOption({ 'max-uses': '0' }, 'max-uses')).toThrow();
    expect(() => optionalIntOption({ 'max-uses': '-1' }, 'max-uses')).toThrow();
    expect(() => optionalIntOption({ 'max-uses': 'abc' }, 'max-uses')).toThrow();
  });
});

describe('booleanOption', () => {
  it('is true for a bare flag or the literal string "true"', () => {
    expect(booleanOption({ json: true }, 'json')).toBe(true);
    expect(booleanOption({ json: 'true' }, 'json')).toBe(true);
  });

  it('is false when absent or any other value', () => {
    expect(booleanOption({}, 'json')).toBe(false);
    expect(booleanOption({ json: 'false' }, 'json')).toBe(false);
  });
});

describe('requirePositional', () => {
  it('returns the positional at the given index', () => {
    expect(requirePositional(['user', 'show', 'alice'], 2, 'usage')).toBe('alice');
  });

  it('throws the usage message when missing', () => {
    expect(() => requirePositional(['user', 'show'], 2, 'Usage: user show <handle>')).toThrow(
      'Usage: user show <handle>',
    );
  });
});

describe('parseIsoDate', () => {
  it('parses a valid ISO date', () => {
    const date = parseIsoDate('2026-01-01T00:00:00.000Z', 'expires');
    expect(date.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects an unparseable value', () => {
    expect(() => parseIsoDate('not-a-date', 'expires')).toThrow(
      '--expires must be a valid ISO 8601 date/time.',
    );
  });
});
