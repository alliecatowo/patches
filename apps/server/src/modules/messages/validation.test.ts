import { MAX_DM_BODY_CHARS } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { createConversationInputSchema, normalizeMessageBody, parseInput } from './validation.js';

describe('direct-message validation (spec §183, §188, §192)', () => {
  it('sanitizes terminal escapes, bidi controls, and normalizes line endings', () => {
    expect(normalizeMessageBody('\u001B[31mhello\u001B[0m\r\nworld\u202E')).toBe('hello\nworld');
  });

  it('rejects an empty body after sanitization', () => {
    expect(() => normalizeMessageBody('\u001B[31m\u001B[0m')).toThrow(
      'Message body cannot be empty.',
    );
  });

  it('allows the exact body limit and rejects the next character', () => {
    expect(normalizeMessageBody('x'.repeat(MAX_DM_BODY_CHARS))).toHaveLength(MAX_DM_BODY_CHARS);
    expect(() => normalizeMessageBody('x'.repeat(MAX_DM_BODY_CHARS + 1))).toThrow(
      `at most ${String(MAX_DM_BODY_CHARS)} characters`,
    );
  });

  it('never includes rejected message content in its error', () => {
    const secret = 'body-that-must-never-reach-errors';
    let thrown: unknown;
    try {
      normalizeMessageBody(`${secret}${'x'.repeat(MAX_DM_BODY_CHARS)}`);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain(secret);
  });

  it('rejects more than seven recipient entries before service-side identity checks', () => {
    const input = {
      clientRequestId: '00000000-0000-4000-8000-000000000001',
      recipientActorIds: Array.from(
        { length: 8 },
        (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      ),
      initialBody: 'hello',
    };

    expect(() => parseInput(createConversationInputSchema, input)).toThrow(
      'at most 8 members including you',
    );
  });
});
