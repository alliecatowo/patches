import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { booleanish } from './boolean.js';

describe('booleanish', () => {
  const schema = z.object({ FLAG: booleanish() });

  it.each([
    ['true', true],
    ['TRUE', true],
    [' true ', true],
    ['1', true],
    ['false', false],
    ['FALSE', false],
    ['0', false],
  ])('coerces %s to %s', (input, expected) => {
    expect(schema.parse({ FLAG: input })).toEqual({ FLAG: expected });
  });

  it('passes real booleans through unchanged', () => {
    expect(schema.parse({ FLAG: true })).toEqual({ FLAG: true });
    expect(schema.parse({ FLAG: false })).toEqual({ FLAG: false });
  });

  it('rejects unrecognized strings', () => {
    const result = schema.safeParse({ FLAG: 'yes' });
    expect(result.success).toBe(false);
  });
});
