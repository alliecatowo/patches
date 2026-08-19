import { describe, expect, it } from 'vitest';

import {
  parseCommunityDescription,
  parseCommunityName,
  parseCommunityRules,
  parseCommunityUpdateMask,
} from './community-validation.js';

describe('community validation (§182, §192)', () => {
  it('accepts the exact lowercase ASCII name grammar', () => {
    expect(parseCommunityName('local_music')).toBe('local_music');
    expect(parseCommunityName('ｌｏｃａｌ')).toBe('local');
    expect(() => parseCommunityName(' local_music ')).toThrow('lowercase letters');
    expect(() => parseCommunityName('Uppercase')).toThrow('lowercase letters');
    expect(() => parseCommunityName('ab')).toThrow('3-32');
    expect(() => parseCommunityName('a'.repeat(33))).toThrow('3-32');
  });

  it.each(['admin', 'mod', 'system', 'patches', 'support', 'root', 'official'])(
    'rejects reserved name %s',
    (name) => {
      expect(() => parseCommunityName(name)).toThrow('reserved');
    },
  );

  it('rejects controls, bidi overrides, zero-width characters and combining text in names', () => {
    for (const name of ['foo\x00bar', 'foo\u202Ebar', 'foo\u200Bbar', 'fo\u0301o']) {
      expect(() => parseCommunityName(name)).toThrow('lowercase letters');
    }
  });

  it('sanitizes inert text and enforces the UTF-8 rule bound', () => {
    expect(parseCommunityDescription('\u001b[31mhello\u001b[0m')).toBe('hello');
    expect(() => parseCommunityRules('😀'.repeat(1025))).toThrow('4096 bytes');
  });

  it('rejects unknown update-mask paths', () => {
    expect([...parseCommunityUpdateMask(['display_name', 'rules'])]).toEqual([
      'display_name',
      'rules',
    ]);
    expect(() => parseCommunityUpdateMask(['score'])).toThrow('unsupported path');
  });
});
