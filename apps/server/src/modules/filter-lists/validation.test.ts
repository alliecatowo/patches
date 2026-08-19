import { describe, expect, it } from 'vitest';

import {
  parseFilterListDescription,
  parseFilterListDisplayName,
  parseFilterListEntries,
  parseFilterListName,
  parseFilterListUpdateMask,
} from './validation.js';

describe('filter-lists/validation (spec §58, §199, §204)', () => {
  describe('parseFilterListName', () => {
    it('rejects an empty name', () => {
      expect(() => parseFilterListName('  ')).toThrow();
    });

    it('rejects a name over the character limit', () => {
      expect(() => parseFilterListName('x'.repeat(65))).toThrow();
    });
  });

  describe('parseFilterListDisplayName', () => {
    it('rejects an empty display name', () => {
      expect(() => parseFilterListDisplayName('')).toThrow();
    });

    it('rejects a display name over the character limit', () => {
      expect(() => parseFilterListDisplayName('x'.repeat(81))).toThrow();
    });
  });

  describe('parseFilterListDescription', () => {
    it('allows an empty description', () => {
      expect(parseFilterListDescription('')).toBe('');
    });

    it('rejects a description over the character limit', () => {
      expect(() => parseFilterListDescription('x'.repeat(501))).toThrow();
    });
  });

  describe('parseFilterListEntries', () => {
    it('rejects zero entries', () => {
      expect(() => parseFilterListEntries([])).toThrow();
    });

    it('rejects more than 2,000 entries (§204)', () => {
      const entries = Array.from({ length: 2001 }, () => ({
        kind: 'SUBSTRING' as const,
        value: 'x',
      }));
      expect(() => parseFilterListEntries(entries)).toThrow();
    });

    it('accepts a valid entry set', () => {
      expect(parseFilterListEntries([{ kind: 'DOMAIN', value: 'spam.example' }])).toEqual([
        { kind: 'DOMAIN', value: 'spam.example' },
      ]);
    });

    // P14-021 (spec §199.4 "domain subscripts"): same rejection filters/validation.ts enforces,
    // applied here since list entries share the exact same DOMAIN kind.
    it('rejects a bare public suffix as a DOMAIN entry', () => {
      expect(() => parseFilterListEntries([{ kind: 'DOMAIN', value: 'co.uk' }])).toThrow();
    });
  });

  describe('parseFilterListUpdateMask', () => {
    it('accepts every documented path', () => {
      expect(parseFilterListUpdateMask(['display_name', 'description', 'entries'])).toEqual(
        new Set(['display_name', 'description', 'entries']),
      );
    });

    it('rejects an unrecognized path', () => {
      expect(() => parseFilterListUpdateMask(['name'])).toThrow();
    });
  });
});
