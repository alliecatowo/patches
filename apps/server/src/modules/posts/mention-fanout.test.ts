import { describe, expect, it } from 'vitest';

import { extractMentionHandles } from './post.service.js';

describe('extractMentionHandles (S-002 mention fan-out cap)', () => {
  it('extracts distinct, lowercased handles', () => {
    expect(extractMentionHandles('hello @Alice and @bob, cc @alice', 50)).toEqual(
      new Set(['alice', 'bob']),
    );
  });

  it('returns an empty set when no handle is mentioned', () => {
    expect(extractMentionHandles('no mentions here', 50)).toEqual(new Set());
  });

  it('stops at the configured cap instead of collecting every handle', () => {
    const wallOfMentions = Array.from({ length: 200 }, (_, i) => `@handle${String(i)}`).join(' ');
    expect(extractMentionHandles(wallOfMentions, 50).size).toBe(50);
  });

  it('the cap is config-driven, not hardcoded', () => {
    const wallOfMentions = Array.from({ length: 20 }, (_, i) => `@handle${String(i)}`).join(' ');
    expect(extractMentionHandles(wallOfMentions, 5).size).toBe(5);
    expect(extractMentionHandles(wallOfMentions, 20).size).toBe(20);
  });
});
