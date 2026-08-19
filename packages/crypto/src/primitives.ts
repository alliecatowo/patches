import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { clean, randomBytes as nobleRandomBytes } from '@noble/ciphers/utils.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { AuthenticationError, MalformedInputError } from './errors.js';
import { KEY_BYTES, type KeyPair } from './types.js';

const encoder = new TextEncoder();

function requireLength(value: Uint8Array, length: number, label: string): void {
  if (value.length !== length) throw new MalformedInputError(`${label} has an invalid length.`);
}

export function randomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new MalformedInputError('Random byte length is invalid.');
  }
  return nobleRandomBytes(length);
}

export function wipe(...secrets: readonly (Uint8Array | undefined)[]): void {
  for (const secret of secrets) if (secret !== undefined) clean(secret);
}

export function keyAgreementKeyPairFromPrivate(privateKey: Uint8Array): KeyPair {
  requireLength(privateKey, KEY_BYTES, 'X25519 private key');
  const ownedPrivateKey = privateKey.slice();
  return { privateKey: ownedPrivateKey, publicKey: x25519.getPublicKey(ownedPrivateKey) };
}

export function generateKeyAgreementKeyPair(): KeyPair {
  return keyAgreementKeyPairFromPrivate(x25519.utils.randomSecretKey());
}

export function signingKeyPairFromPrivate(privateKey: Uint8Array): KeyPair {
  requireLength(privateKey, KEY_BYTES, 'Ed25519 private key');
  const ownedPrivateKey = privateKey.slice();
  return { privateKey: ownedPrivateKey, publicKey: ed25519.getPublicKey(ownedPrivateKey) };
}

export function generateSigningKeyPair(): KeyPair {
  return signingKeyPairFromPrivate(ed25519.utils.randomSecretKey());
}

export function keyAgreement(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  requireLength(privateKey, KEY_BYTES, 'X25519 private key');
  requireLength(publicKey, KEY_BYTES, 'X25519 public key');
  try {
    return x25519.getSharedSecret(privateKey, publicKey);
  } catch {
    throw new AuthenticationError();
  }
}

export function sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  requireLength(privateKey, KEY_BYTES, 'Ed25519 private key');
  return ed25519.sign(message, privateKey);
}

export function verifyStrict(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey, { zip215: false });
  } catch {
    return false;
  }
}

export function sha256Hash(input: Uint8Array): Uint8Array {
  return sha256(input);
}

export function hmacSha256(key: Uint8Array, input: Uint8Array): Uint8Array {
  return hmac(sha256, key, input);
}

export function hkdfSha256(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array | string,
  outputBytes: number,
): Uint8Array {
  return nobleHkdf(
    sha256,
    inputKeyMaterial,
    salt,
    typeof info === 'string' ? encoder.encode(info) : info,
    outputBytes,
  );
}

export function aeadEncrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  associatedData: Uint8Array,
): Uint8Array {
  requireLength(key, KEY_BYTES, 'AEAD key');
  return xchacha20poly1305(key, nonce, associatedData).encrypt(plaintext);
}

export function aeadDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  associatedData: Uint8Array,
): Uint8Array {
  requireLength(key, KEY_BYTES, 'AEAD key');
  try {
    return xchacha20poly1305(key, nonce, associatedData).decrypt(ciphertext);
  } catch {
    throw new AuthenticationError();
  }
}
