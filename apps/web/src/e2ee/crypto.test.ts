/**
 * Browser crypto barrel tests. Two claims are worth pinning: the primitives the vault and
 * the ratchet stand on behave (round-trip, authenticate, derive deterministically) inside
 * the browser-shaped environment this app runs in, and the barrel keeps exporting the
 * whole set — a silently dropped re-export would only surface as a runtime crash.
 */
import { describe, expect, it } from 'vitest';

import * as browserCrypto from './crypto.js';
import {
  KEY_BYTES,
  MalformedInputError,
  aeadDecrypt,
  aeadEncrypt,
  concatBytes,
  generateKeyAgreementKeyPair,
  generateSigningKeyPair,
  hkdfSha256,
  randomBytes,
  sha256Hash,
  zeroize,
} from './crypto.js';

const KEY = new Uint8Array(32).fill(1);
const NONCE = new Uint8Array(24).fill(2);

describe('aead', () => {
  it('round-trips with associated data', () => {
    const plaintext = new TextEncoder().encode('ratchet state bytes');
    const aad = new Uint8Array([9, 9]);

    const ciphertext = aeadEncrypt(KEY, NONCE, plaintext, aad);

    expect([...ciphertext]).not.toEqual([...plaintext]);
    expect([...aeadDecrypt(KEY, NONCE, ciphertext, aad)]).toEqual([...plaintext]);
  });

  it('rejects a changed key, nonce, associated data, or ciphertext', () => {
    const plaintext = randomBytes(32);
    const aad = new Uint8Array([1]);
    const ciphertext = aeadEncrypt(KEY, NONCE, plaintext, aad);

    expect(() => aeadDecrypt(new Uint8Array(32).fill(3), NONCE, ciphertext, aad)).toThrow();
    expect(() => aeadDecrypt(KEY, new Uint8Array(24).fill(3), ciphertext, aad)).toThrow();
    expect(() => aeadDecrypt(KEY, NONCE, ciphertext, new Uint8Array([2]))).toThrow();

    const flipped = ciphertext.slice();
    flipped[0] = (flipped[0] ?? 0) ^ 0x01;
    expect(() => aeadDecrypt(KEY, NONCE, flipped, aad)).toThrow();
  });
});

describe('hkdfSha256', () => {
  it('is deterministic, and separated by both salt and info', () => {
    const ikm = new Uint8Array(32).fill(5);
    const salt = new Uint8Array([1, 2, 3]);

    const base = hkdfSha256(ikm, salt, 'info-a', 32);

    expect(base).toHaveLength(32);
    expect([...hkdfSha256(ikm, salt, 'info-a', 32)]).toEqual([...base]);
    expect([...hkdfSha256(ikm, salt, 'info-b', 32)]).not.toEqual([...base]);
    expect([...hkdfSha256(ikm, new Uint8Array([9]), 'info-a', 32)]).not.toEqual([...base]);
    expect(hkdfSha256(ikm, salt, 'info-a', 64)).toHaveLength(64);
  });
});

describe('key generation in the browser', () => {
  it('produces distinct full-length keypairs from platform entropy', () => {
    const signing = generateSigningKeyPair();
    const agreement = generateKeyAgreementKeyPair();

    for (const key of [
      signing.privateKey,
      signing.publicKey,
      agreement.privateKey,
      agreement.publicKey,
    ]) {
      expect(key).toHaveLength(KEY_BYTES);
    }
    expect([...signing.publicKey]).not.toEqual([...generateSigningKeyPair().publicKey]);
    expect([...randomBytes(32)]).not.toEqual([...randomBytes(32)]);
  });
});

describe('byte helpers', () => {
  it('hashes, concatenates, and zeroizes', () => {
    const digest = sha256Hash(new TextEncoder().encode('patches'));
    expect(digest).toHaveLength(32);
    expect([...sha256Hash(new TextEncoder().encode('patches'))]).toEqual([...digest]);

    expect([...concatBytes(new Uint8Array([1]), new Uint8Array([2, 3]))]).toEqual([1, 2, 3]);

    const secret = new Uint8Array([7, 7, 7]);
    zeroize(secret);
    expect([...secret]).toEqual([0, 0, 0]);
  });

  it('rejects malformed reader input with the shared error type', () => {
    const reader = new browserCrypto.ByteReader(new Uint8Array([1]));

    expect(() => reader.fixed(8)).toThrow(MalformedInputError);
  });
});

describe('the barrel surface', () => {
  it('still re-exports everything the runtime imports from it', () => {
    // A dropped re-export is a runtime crash in a code path tests may not reach.
    for (const name of [
      'ByteReader',
      'ByteWriter',
      'concatBytes',
      'KEY_BYTES',
      'MalformedInputError',
      'randomBytes',
      'sha256Hash',
      'zeroize',
      'certifyDevice',
      'createSignedPreKey',
      'generateKeyAgreementKeyPair',
      'generateSigningKeyPair',
      'rosterDigest',
      'sign',
      'signDeviceRoster',
      'E2EE_PROTOCOL',
      'E2EE_VERSION',
      'commitFranking',
      'createFrankingOpeningKey',
      'sealDeviceEnvelope',
      'openDeviceEnvelope',
      'ReplayedMessageError',
      'disposeRatchetState',
      'encodeRatchetState',
      'decodeRatchetState',
      'aeadEncrypt',
      'aeadDecrypt',
      'hkdfSha256',
    ]) {
      expect(browserCrypto).toHaveProperty(name);
    }
  });
});
