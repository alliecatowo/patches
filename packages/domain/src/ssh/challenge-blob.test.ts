import { describe, expect, it } from 'vitest';

import {
  buildSshChallengeBlob,
  SSH_ENROLL_DOMAIN_SEPARATOR,
  SSH_LOGIN_DOMAIN_SEPARATOR,
  type SshChallengeBlobInput,
} from './challenge-blob.js';

/**
 * Fixed fixture reused by `apps/server` and `apps/tui`'s own parity tests (A-020): both sides
 * must produce byte-identical output for the same input now that there is exactly one
 * implementation, so the fixture and its pinned hex live here as the source of truth.
 */
export const SSH_CHALLENGE_BLOB_FIXTURE: SshChallengeBlobInput = {
  domainSeparator: SSH_LOGIN_DOMAIN_SEPARATOR,
  nodeDomain: 'example.test',
  challengeId: '11111111-1111-4111-8111-111111111111',
  nonce: Buffer.from('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex'),
  fingerprint: 'SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCD',
  expiresAt: new Date('2026-08-17T12:00:00Z'),
};

export const SSH_CHALLENGE_BLOB_FIXTURE_HEX =
  '00000014706174636865732d7373682d6c6f67696e2d76310000000c6578616d706c652e746573740000002431313131313131312d313131312d343131312d383131312d31313131313131313131313100000' +
  '01f0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0000002f5348413235363a6162636465666768696a6b6c6d6e6f707172737475767778797a30313233343536373839414243' +
  '440000000a31373836393638303030';

describe('buildSshChallengeBlob', () => {
  it('matches the pinned fixture byte-for-byte', () => {
    expect(buildSshChallengeBlob(SSH_CHALLENGE_BLOB_FIXTURE).toString('hex')).toBe(
      SSH_CHALLENGE_BLOB_FIXTURE_HEX,
    );
  });

  it('truncates expiresAt to whole Unix seconds', () => {
    const withMillis = buildSshChallengeBlob({
      ...SSH_CHALLENGE_BLOB_FIXTURE,
      expiresAt: new Date(SSH_CHALLENGE_BLOB_FIXTURE.expiresAt.getTime() + 999),
    });
    expect(withMillis).toEqual(buildSshChallengeBlob(SSH_CHALLENGE_BLOB_FIXTURE));
  });

  it('produces different bytes for the login vs. enroll domain separator', () => {
    const login = buildSshChallengeBlob(SSH_CHALLENGE_BLOB_FIXTURE);
    const enroll = buildSshChallengeBlob({
      ...SSH_CHALLENGE_BLOB_FIXTURE,
      domainSeparator: SSH_ENROLL_DOMAIN_SEPARATOR,
    });
    expect(enroll).not.toEqual(login);
  });
});
