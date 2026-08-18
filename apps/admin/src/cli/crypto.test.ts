import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { generateInviteCode, hashInviteCode } from './crypto.js';

describe('hashInviteCode', () => {
  it('matches a plain sha256 hex digest — must agree with AuthService.hashCode', () => {
    expect(hashInviteCode('my-code')).toBe(
      createHash('sha256').update('my-code', 'utf8').digest('hex'),
    );
  });

  it('is deterministic', () => {
    expect(hashInviteCode('same')).toBe(hashInviteCode('same'));
  });
});

describe('generateInviteCode', () => {
  it('generates a URL-safe, high-entropy, non-repeating code', () => {
    const a = generateInviteCode();
    const b = generateInviteCode();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThan(32);
  });
});
