import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  decryptFederationPrivateKeyPem,
  encryptFederationPrivateKeyPem,
} from './federation-key-cipher.js';

const KEY = randomBytes(32).toString('base64');
const SAMPLE_PEM =
  '-----BEGIN PRIVATE KEY-----\nZmFrZS1rZXktbWF0ZXJpYWw=\n-----END PRIVATE KEY-----\n';

describe('federation-key-cipher (B-026)', () => {
  it('round-trips a PEM through encrypt/decrypt', () => {
    const encrypted = encryptFederationPrivateKeyPem(SAMPLE_PEM, KEY);
    expect(decryptFederationPrivateKeyPem(encrypted, KEY)).toBe(SAMPLE_PEM);
  });

  it('produces a different ciphertext and IV on every call (GCM nonce must never repeat)', () => {
    const first = encryptFederationPrivateKeyPem(SAMPLE_PEM, KEY);
    const second = encryptFederationPrivateKeyPem(SAMPLE_PEM, KEY);
    expect(first.iv.equals(second.iv)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it('fails to decrypt under the wrong key', () => {
    const encrypted = encryptFederationPrivateKeyPem(SAMPLE_PEM, KEY);
    const wrongKey = randomBytes(32).toString('base64');
    expect(() => decryptFederationPrivateKeyPem(encrypted, wrongKey)).toThrow();
  });

  it('fails to decrypt a tampered ciphertext (GCM authentication)', () => {
    const encrypted = encryptFederationPrivateKeyPem(SAMPLE_PEM, KEY);
    const tampered = { ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext) };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 0xff;
    expect(() => decryptFederationPrivateKeyPem(tampered, KEY)).toThrow();
  });

  it('rejects a key that does not decode to exactly 32 bytes', () => {
    const shortKey = randomBytes(16).toString('base64');
    expect(() => encryptFederationPrivateKeyPem(SAMPLE_PEM, shortKey)).toThrow(/32 bytes/);
  });
});
