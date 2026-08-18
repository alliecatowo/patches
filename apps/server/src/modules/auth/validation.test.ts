import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error.js';
import {
  loginInputSchema,
  normalizeEmail,
  normalizeHandle,
  parseInput,
  registerInputSchema,
  resetPasswordInputSchema,
  sshEnrollmentBindingSchema,
} from './validation.js';

describe('handle validation (§22)', () => {
  it.each(['abc', 'allison', 'techno_rat', 'alice123', 'a'.repeat(30)])('accepts %s', (handle) => {
    expect(parseInput(registerInputSchema, { handle, displayName: '' }).handle).toBe(handle);
  });

  it.each([
    ['ab', 'too short'],
    ['a'.repeat(31), 'too long'],
    ['has space', 'space'],
    ['dash-not-allowed', 'hyphen'],
    ['émile', 'non-ASCII'],
    ['tab\there', 'control character'],
  ])('rejects %s (%s)', (handle) => {
    expect(() => parseInput(registerInputSchema, { handle, displayName: '' })).toThrow(AppError);
  });

  it('normalizes to a lowercase canonical form while preserving the display form', () => {
    const parsed = parseInput(registerInputSchema, { handle: 'Allison', displayName: '' });
    expect(parsed.handle).toBe('Allison');
    expect(normalizeHandle(parsed.handle)).toBe('allison');
  });
});

describe('display name and email limits (§58)', () => {
  it('accepts a display name of exactly 80 characters', () => {
    const displayName = 'x'.repeat(80);
    expect(parseInput(registerInputSchema, { handle: 'abc', displayName }).displayName).toBe(
      displayName,
    );
  });

  it('rejects a display name of 81 characters', () => {
    expect(() =>
      parseInput(registerInputSchema, { handle: 'abc', displayName: 'x'.repeat(81) }),
    ).toThrow(AppError);
  });

  it.each(['not-an-email', 'a@', '@b.com', `${'a'.repeat(250)}@example.com`])(
    'rejects the email %s',
    (email) => {
      expect(() =>
        parseInput(registerInputSchema, { handle: 'abc', displayName: '', email }),
      ).toThrow(AppError);
    },
  );

  it('lowercases an email for uniqueness without changing what was entered', () => {
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
  });
});

describe('password limits', () => {
  it('rejects a password under 12 characters', () => {
    expect(() => parseInput(resetPasswordInputSchema, { code: 'c', newPassword: 'short' })).toThrow(
      AppError,
    );
  });

  it('accepts a 12-character password', () => {
    expect(
      parseInput(resetPasswordInputSchema, { code: 'c', newPassword: 'x'.repeat(12) }).newPassword,
    ).toHaveLength(12);
  });

  it('rejects an absurdly long password rather than hashing it', () => {
    expect(() =>
      parseInput(resetPasswordInputSchema, { code: 'c', newPassword: 'x'.repeat(257) }),
    ).toThrow(AppError);
  });

  it('does not impose a minimum length at login — only registration sets policy', () => {
    expect(parseInput(loginInputSchema, { emailOrHandle: 'a', password: 'x' }).password).toBe('x');
  });
});

describe('parseInput', () => {
  it('reports a VALIDATION_ERROR naming the offending field', () => {
    try {
      parseInput(registerInputSchema, { handle: 'no', displayName: '' });
      expect.unreachable('expected parseInput to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('VALIDATION_ERROR');
      expect((error as AppError).message).toContain('handle');
    }
  });

  it('never echoes the rejected value back to the client', () => {
    try {
      parseInput(resetPasswordInputSchema, { code: 'c', newPassword: 'hunter2' });
      expect.unreachable('expected parseInput to throw');
    } catch (error) {
      expect((error as AppError).message).not.toContain('hunter2');
    }
  });
});

describe('sshEnrollmentBindingSchema (B-021)', () => {
  const valid = {
    purpose: 'ENROLL',
    userId: '11111111-1111-4111-8111-111111111111',
    fingerprint: 'SHA256:abc',
  };

  it('accepts a well-formed enrollment binding', () => {
    expect(sshEnrollmentBindingSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a login challenge (no purpose) so a null claimedHandle never parses', () => {
    expect(sshEnrollmentBindingSchema.safeParse(null).success).toBe(false);
  });

  it('rejects a non-ENROLL purpose', () => {
    expect(sshEnrollmentBindingSchema.safeParse({ ...valid, purpose: 'LOGIN' }).success).toBe(
      false,
    );
  });

  it('rejects a non-uuid userId', () => {
    expect(sshEnrollmentBindingSchema.safeParse({ ...valid, userId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });
});
