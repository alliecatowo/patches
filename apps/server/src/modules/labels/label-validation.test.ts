import { randomUUID } from 'node:crypto';

import { LabelAction as ProtoLabelAction, type LabelVocabularyEntry } from '@patches/proto/nest';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import {
  labelActionFromProto,
  MAX_LABEL_DESCRIPTION_CHARS,
  MAX_LABEL_VALUE_CHARS,
  MAX_LABELER_VOCABULARY_ENTRIES,
  parseExpiresAt,
  parseLabelValue,
  parseStoredVocabulary,
  parseSubject,
  parseVocabulary,
} from './label-validation.js';

function entry(overrides: Partial<LabelVocabularyEntry> = {}): LabelVocabularyEntry {
  return {
    value: 'spam',
    description: 'Spam',
    defaultAction: ProtoLabelAction.LABEL_ACTION_WARN,
    mandatory: false,
    ...overrides,
  };
}

describe('label-validation (spec §200.2, §202, §206)', () => {
  describe('labelActionFromProto', () => {
    it('maps every real action', () => {
      expect(labelActionFromProto(ProtoLabelAction.LABEL_ACTION_IGNORE)).toBe('IGNORE');
      expect(labelActionFromProto(ProtoLabelAction.LABEL_ACTION_WARN)).toBe('WARN');
      expect(labelActionFromProto(ProtoLabelAction.LABEL_ACTION_COLLAPSE)).toBe('COLLAPSE');
      expect(labelActionFromProto(ProtoLabelAction.LABEL_ACTION_HIDE)).toBe('HIDE');
    });

    it('rejects LABEL_ACTION_UNSPECIFIED', () => {
      expect(() => labelActionFromProto(ProtoLabelAction.LABEL_ACTION_UNSPECIFIED)).toThrow(
        AppError,
      );
    });
  });

  describe('parseVocabulary', () => {
    it('parses a valid vocabulary, lowercasing and trimming values', () => {
      const parsed = parseVocabulary([entry({ value: ' Spam ' }), entry({ value: 'nsfw' })]);
      expect(parsed).toEqual([
        { value: 'spam', description: 'Spam', defaultAction: 'WARN', mandatory: false },
        { value: 'nsfw', description: 'Spam', defaultAction: 'WARN', mandatory: false },
      ]);
    });

    it('rejects an empty vocabulary', () => {
      expect(() => parseVocabulary([])).toThrow(AppError);
    });

    it('rejects more than the local sanity ceiling', () => {
      const entries = Array.from({ length: MAX_LABELER_VOCABULARY_ENTRIES + 1 }, (_, index) =>
        entry({ value: `value-${String(index)}` }),
      );
      expect(() => parseVocabulary(entries)).toThrow(AppError);
    });

    it('rejects a duplicate value', () => {
      expect(() => parseVocabulary([entry({ value: 'spam' }), entry({ value: 'SPAM' })])).toThrow(
        AppError,
      );
    });

    it('rejects a value that is not lowercase-letters/digits/hyphens', () => {
      expect(() => parseVocabulary([entry({ value: 'not a value!' })])).toThrow(AppError);
    });

    it('rejects a value longer than the max', () => {
      expect(() =>
        parseVocabulary([entry({ value: 'a'.repeat(MAX_LABEL_VALUE_CHARS + 1) })]),
      ).toThrow(AppError);
    });

    it('rejects a description longer than the max', () => {
      expect(() =>
        parseVocabulary([entry({ description: 'a'.repeat(MAX_LABEL_DESCRIPTION_CHARS + 1) })]),
      ).toThrow(AppError);
    });

    it('rejects a free-text (never-set) default action', () => {
      expect(() =>
        parseVocabulary([entry({ defaultAction: ProtoLabelAction.LABEL_ACTION_UNSPECIFIED })]),
      ).toThrow(AppError);
    });

    it('passes mandatory through', () => {
      expect(parseVocabulary([entry({ mandatory: true })])[0]?.mandatory).toBe(true);
    });
  });

  describe('parseSubject', () => {
    const actorId = randomUUID();
    const postId = randomUUID();

    it('accepts exactly a subject actor id', () => {
      expect(parseSubject(actorId, '')).toEqual({
        subjectType: 'ACTOR',
        subjectActorId: actorId,
        subjectPostId: null,
      });
    });

    it('accepts exactly a subject post id', () => {
      expect(parseSubject('', postId)).toEqual({
        subjectType: 'POST',
        subjectActorId: null,
        subjectPostId: postId,
      });
    });

    it('rejects neither set', () => {
      expect(() => parseSubject('', '')).toThrow(AppError);
    });

    it('rejects both set', () => {
      expect(() => parseSubject(actorId, postId)).toThrow(AppError);
    });

    it('rejects a malformed id', () => {
      expect(() => parseSubject('not-a-uuid', '')).toThrow(AppError);
    });
  });

  describe('parseLabelValue', () => {
    it('accepts a hyphenated value', () => {
      expect(parseLabelValue('needs-cw')).toBe('needs-cw');
    });

    it('rejects free text with spaces', () => {
      expect(() => parseLabelValue('this is not a value')).toThrow(AppError);
    });

    it('rejects an empty value', () => {
      expect(() => parseLabelValue('')).toThrow(AppError);
    });
  });

  describe('parseExpiresAt', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    it('undefined means never expires', () => {
      expect(parseExpiresAt(undefined, now)).toBeNull();
    });

    it('accepts a future date', () => {
      const future = new Date(now.getTime() + 1000);
      expect(parseExpiresAt(future, now)).toBe(future);
    });

    it('rejects a date that is not strictly in the future', () => {
      expect(() => parseExpiresAt(now, now)).toThrow(AppError);
      expect(() => parseExpiresAt(new Date(now.getTime() - 1000), now)).toThrow(AppError);
    });
  });

  describe('parseStoredVocabulary', () => {
    it('round-trips what parseVocabulary produces', () => {
      const parsed = parseVocabulary([entry()]);
      expect(parseStoredVocabulary(parsed)).toEqual(parsed);
    });

    it('rejects a malformed stored value rather than trusting the jsonb column', () => {
      expect(() => parseStoredVocabulary([{ value: 'spam' }])).toThrow(AppError);
      expect(() => parseStoredVocabulary('not-an-array')).toThrow(AppError);
      expect(() => parseStoredVocabulary(null)).toThrow(AppError);
    });
  });
});
