import { describe, expect, it } from 'vitest';

import {
  evaluateCandidate,
  hideActorIds,
  hideTagNames,
  isRegistrableDomainValue,
  type EffectiveFilterRule,
  type FilterMatchCandidate,
} from './filter-matching.js';

function candidate(overrides: Partial<FilterMatchCandidate> = {}): FilterMatchCandidate {
  return {
    id: 'post-1',
    authorActorId: 'author-1',
    quotedAuthorActorId: null,
    reposterActorIds: [],
    body: null,
    contentWarning: null,
    altTexts: [],
    linkUrl: null,
    tagNames: [],
    ...overrides,
  };
}

function rule(overrides: Partial<EffectiveFilterRule> = {}): EffectiveFilterRule {
  return {
    kind: 'SUBSTRING',
    value: 'spoiler',
    action: 'HIDE',
    provenance: 'FILTER',
    name: 'My Filter',
    listOwner: null,
    ...overrides,
  };
}

describe('filter-matching (spec §198.2, §198.3)', () => {
  describe('substring', () => {
    it('matches a case-insensitive, NFKC-folded substring of the body', () => {
      const match = evaluateCandidate(
        [rule({ kind: 'SUBSTRING', value: 'CAFÉ' })],
        candidate({ body: 'meet me at the café later' }),
      );
      expect(match?.action).toBe('HIDE');
    });

    it('also matches against content warning and media alt text', () => {
      expect(
        evaluateCandidate(
          [rule({ kind: 'SUBSTRING', value: 'gore' })],
          candidate({ contentWarning: 'gore warning' }),
        ),
      ).not.toBeNull();
      expect(
        evaluateCandidate(
          [rule({ kind: 'SUBSTRING', value: 'gore' })],
          candidate({ altTexts: ['a photo depicting gore'] }),
        ),
      ).not.toBeNull();
    });

    it('does not match when the substring is absent', () => {
      expect(
        evaluateCandidate(
          [rule({ kind: 'SUBSTRING', value: 'spoiler' })],
          candidate({ body: 'no bad words here' }),
        ),
      ).toBeNull();
    });
  });

  describe('word', () => {
    it('does not match a mid-word occurrence', () => {
      const match = evaluateCandidate(
        [rule({ kind: 'WORD', value: 'cat' })],
        candidate({ body: 'concatenate this' }),
      );
      expect(match).toBeNull();
    });

    it('matches at a real word boundary', () => {
      const match = evaluateCandidate(
        [rule({ kind: 'WORD', value: 'cat' })],
        candidate({ body: 'I have a cat' }),
      );
      expect(match).not.toBeNull();
    });

    it('a term beginning in punctuation still matches (naive \\b wrapping would break this)', () => {
      const match = evaluateCandidate(
        [rule({ kind: 'WORD', value: ':(' })],
        candidate({ body: 'feeling sad :(' }),
      );
      expect(match).not.toBeNull();
    });

    it('a term ending in a word character still requires a right boundary', () => {
      const rules = [rule({ kind: 'WORD', value: '#1' })];
      expect(evaluateCandidate(rules, candidate({ body: 'we are #1 today' }))).not.toBeNull();
      expect(evaluateCandidate(rules, candidate({ body: 'we are #100 today' }))).toBeNull();
    });
  });

  describe('tag', () => {
    it('matches an exact, normalized tag name', () => {
      const match = evaluateCandidate(
        [rule({ kind: 'TAG', value: '#TypeScript' })],
        candidate({ tagNames: ['typescript'] }),
      );
      expect(match).not.toBeNull();
    });

    it('does not match a different tag', () => {
      expect(
        evaluateCandidate(
          [rule({ kind: 'TAG', value: 'javascript' })],
          candidate({ tagNames: ['typescript'] }),
        ),
      ).toBeNull();
    });
  });

  describe('actor', () => {
    it('matches the author, the quoted author, or a reposter', () => {
      const authorRule = rule({ kind: 'ACTOR', value: 'author-1' });
      expect(
        evaluateCandidate([authorRule], candidate({ authorActorId: 'author-1' })),
      ).not.toBeNull();

      const quotedRule = rule({ kind: 'ACTOR', value: 'quoted-1' });
      expect(
        evaluateCandidate(
          [quotedRule],
          candidate({ authorActorId: 'other', quotedAuthorActorId: 'quoted-1' }),
        ),
      ).not.toBeNull();

      const reposterRule = rule({ kind: 'ACTOR', value: 'reposter-1' });
      expect(
        evaluateCandidate(
          [reposterRule],
          candidate({ authorActorId: 'other', reposterActorIds: ['reposter-1'] }),
        ),
      ).not.toBeNull();
    });
  });

  describe('domain', () => {
    it('matches a link post whose registrable domain equals the term', () => {
      const match = evaluateCandidate(
        [rule({ kind: 'DOMAIN', value: 'example.com' })],
        candidate({ linkUrl: 'https://sub.example.com/path' }),
      );
      expect(match).not.toBeNull();
    });

    it('matches a link embedded in the body text', () => {
      const match = evaluateCandidate(
        [rule({ kind: 'DOMAIN', value: 'spam.example' })],
        candidate({ body: 'check this out: https://www.spam.example/deal' }),
      );
      expect(match).not.toBeNull();
    });

    it('does not match an unrelated domain', () => {
      expect(
        evaluateCandidate(
          [rule({ kind: 'DOMAIN', value: 'spam.example' })],
          candidate({ linkUrl: 'https://good.example/x' }),
        ),
      ).toBeNull();
    });

    // P14-021: tldts-backed PSL matching, replacing the naive last-two-labels approximation.
    it('a multi-label public-suffix rule (example.co.uk) matches a subdomain', () => {
      const match = evaluateCandidate(
        [rule({ kind: 'DOMAIN', value: 'example.co.uk' })],
        candidate({ linkUrl: 'https://sub.example.co.uk/path' }),
      );
      expect(match).not.toBeNull();
    });

    it('a multi-label public-suffix rule does not match a different registrant under the same suffix', () => {
      expect(
        evaluateCandidate(
          [rule({ kind: 'DOMAIN', value: 'example.co.uk' })],
          candidate({ linkUrl: 'https://other.co.uk/path' }),
        ),
      ).toBeNull();
    });
  });

  describe('isRegistrableDomainValue (P14-021, spec §199.4 "domain subscripts")', () => {
    it('accepts a real registrable domain, with or without a scheme/subdomain', () => {
      expect(isRegistrableDomainValue('example.co.uk')).toBe(true);
      expect(isRegistrableDomainValue('https://sub.example.co.uk/path')).toBe(true);
      expect(isRegistrableDomainValue('example.com')).toBe(true);
    });

    it('rejects a bare public suffix such as co.uk', () => {
      expect(isRegistrableDomainValue('co.uk')).toBe(false);
      expect(isRegistrableDomainValue('com')).toBe(false);
    });
  });

  describe('hideActorIds / hideTagNames (P14-021 SQL pushdown)', () => {
    it('collects only HIDE-action ACTOR rule values, deduped', () => {
      const rules: EffectiveFilterRule[] = [
        rule({ kind: 'ACTOR', value: 'actor-1', action: 'HIDE' }),
        rule({ kind: 'ACTOR', value: 'actor-1', action: 'HIDE' }),
        rule({ kind: 'ACTOR', value: 'actor-2', action: 'COLLAPSE' }),
        rule({ kind: 'TAG', value: 'spoilers', action: 'HIDE' }),
      ];
      expect(hideActorIds(rules)).toEqual(['actor-1']);
    });

    it('collects only HIDE-action TAG rule values, normalized and deduped', () => {
      const rules: EffectiveFilterRule[] = [
        rule({ kind: 'TAG', value: '#Spoilers', action: 'HIDE' }),
        rule({ kind: 'TAG', value: 'spoilers', action: 'HIDE' }),
        rule({ kind: 'TAG', value: 'news', action: 'WARN' }),
      ];
      expect(hideTagNames(rules)).toEqual(['spoilers']);
    });
  });

  describe('action precedence', () => {
    it('hide beats collapse beats warn when multiple rules match', () => {
      const match = evaluateCandidate(
        [
          rule({ kind: 'SUBSTRING', value: 'x', action: 'WARN', name: 'warn-rule' }),
          rule({ kind: 'SUBSTRING', value: 'x', action: 'HIDE', name: 'hide-rule' }),
          rule({ kind: 'SUBSTRING', value: 'x', action: 'COLLAPSE', name: 'collapse-rule' }),
        ],
        candidate({ body: 'x marks the spot' }),
      );
      expect(match?.action).toBe('HIDE');
      expect(match?.name).toBe('hide-rule');
    });
  });

  it('returns null when no rule matches', () => {
    expect(evaluateCandidate([rule()], candidate({ body: 'nothing to see here' }))).toBeNull();
  });
});
