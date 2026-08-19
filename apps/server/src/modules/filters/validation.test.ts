import { describe, expect, it } from 'vitest';

import {
  parseDbFilterAction,
  parseDbFilterScope,
  parseDbFilterTermKind,
  parseFilterName,
  parseFilterScopes,
  parseFilterTerms,
  parseFilterUpdateMask,
  parseImportPayload,
} from './validation.js';

describe('filters/validation (spec §58, §198, §204)', () => {
  describe('parseFilterName', () => {
    it('rejects an empty name', () => {
      expect(() => parseFilterName('   ')).toThrow();
    });

    it('rejects a name over the character limit', () => {
      expect(() => parseFilterName('x'.repeat(101))).toThrow();
    });

    it('trims and accepts a valid name', () => {
      expect(parseFilterName('  spoilers  ')).toBe('spoilers');
    });
  });

  describe('parseFilterTerms', () => {
    it('rejects zero terms', () => {
      expect(() => parseFilterTerms([])).toThrow();
    });

    it('rejects more than 20 terms (§204)', () => {
      const terms = Array.from({ length: 21 }, () => ({ kind: 'SUBSTRING' as const, value: 'x' }));
      expect(() => parseFilterTerms(terms)).toThrow();
    });

    it('rejects an empty term value', () => {
      expect(() => parseFilterTerms([{ kind: 'SUBSTRING', value: '   ' }])).toThrow();
    });

    it('sanitizes and trims a valid term set', () => {
      const parsed = parseFilterTerms([{ kind: 'TAG', value: '  spoilers  ' }]);
      expect(parsed).toEqual([{ kind: 'TAG', value: 'spoilers' }]);
    });
  });

  describe('parseFilterScopes', () => {
    it('rejects zero scopes', () => {
      expect(() => parseFilterScopes([])).toThrow();
    });

    it('dedupes repeated scopes', () => {
      expect(parseFilterScopes(['HOME', 'HOME', 'LOCAL'])).toEqual(['HOME', 'LOCAL']);
    });
  });

  describe('parseFilterUpdateMask', () => {
    it('accepts every documented path', () => {
      expect(parseFilterUpdateMask(['name', 'terms', 'scopes', 'action', 'expires_at'])).toEqual(
        new Set(['name', 'terms', 'scopes', 'action', 'expires_at']),
      );
    });

    it('rejects an unrecognized path', () => {
      expect(() => parseFilterUpdateMask(['id'])).toThrow();
    });
  });

  describe('import vocabulary parsers', () => {
    it('accepts recognized values', () => {
      expect(parseDbFilterTermKind('SUBSTRING')).toBe('SUBSTRING');
      expect(parseDbFilterScope('HOME')).toBe('HOME');
      expect(parseDbFilterAction('HIDE')).toBe('HIDE');
    });

    it('rejects an unrecognized value in each case', () => {
      expect(() => parseDbFilterTermKind('REGEX')).toThrow();
      expect(() => parseDbFilterScope('PROFILE')).toThrow();
      expect(() => parseDbFilterAction('DELETE')).toThrow();
    });
  });

  describe('parseImportPayload (spec §198.5)', () => {
    it('rejects invalid JSON with FILTER_IMPORT_INVALID', () => {
      expect.assertions(1);
      try {
        parseImportPayload('not json');
      } catch (error) {
        expect((error as { code?: string }).code).toBe('FILTER_IMPORT_INVALID');
      }
    });

    it('rejects a payload that is not the documented export shape', () => {
      expect(() => parseImportPayload(JSON.stringify({ notFilters: [] }))).toThrow();
    });

    it('parses a well-formed export payload', () => {
      const json = JSON.stringify({
        filters: [
          {
            name: 'spoilers',
            terms: [{ kind: 'SUBSTRING', value: 'ending' }],
            scopes: ['HOME'],
            action: 'COLLAPSE',
            expiresAt: null,
          },
        ],
      });
      expect(parseImportPayload(json)).toHaveLength(1);
    });
  });
});
