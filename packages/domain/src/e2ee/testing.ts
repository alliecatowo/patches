/**
 * Test doubles for the injected crypto interfaces. Not exported from the package barrel and
 * never bundled: `tsup` builds `src/index.ts` only.
 *
 * These are **not** cryptography and must never be used outside tests. They exist so the
 * contract's tests exercise the rules — chaining, monotonicity, binding, exactness — rather
 * than re-testing Ed25519. `@patches/crypto` supplies the real implementations.
 */
import type { Bytes, DigestFunction, SignatureVerifier } from './types.js';
import { bytesEqual, E2EE_DIGEST_BYTES, ED25519_SIGNATURE_BYTES } from './types.js';

/**
 * A deterministic 32-byte mixing function. Collision-resistant enough that a test asserting
 * "digest disagrees" is meaningful; nothing more is claimed.
 */
export const fakeDigest: DigestFunction = (input: Bytes): Bytes => {
  const out = new Uint8Array(E2EE_DIGEST_BYTES);
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ (input[i] ?? 0), 0x01000193) >>> 0;
    out[i % E2EE_DIGEST_BYTES] = (out[i % E2EE_DIGEST_BYTES]! + (h & 0xff) + i) & 0xff;
  }
  for (let i = 0; i < E2EE_DIGEST_BYTES; i += 1) {
    h = Math.imul(h ^ (out[i]! + input.length + i), 0x01000193) >>> 0;
    out[i] = h & 0xff;
  }
  return out;
};

/** Produces the 64-byte "signature" {@link fakeVerifier} accepts for this key and message. */
export function fakeSign(publicKey: Bytes, message: Bytes): Bytes {
  const combined = new Uint8Array(publicKey.length + message.length);
  combined.set(publicKey, 0);
  combined.set(message, publicKey.length);
  const digest = fakeDigest(combined);
  const signature = new Uint8Array(ED25519_SIGNATURE_BYTES);
  signature.set(digest, 0);
  signature.set(digest, E2EE_DIGEST_BYTES);
  return signature;
}

/** Accepts exactly what {@link fakeSign} produced, and returns `false` on anything else. */
export const fakeVerifier: SignatureVerifier = {
  verifyEd25519({ publicKey, message, signature }): boolean {
    if (signature.length !== ED25519_SIGNATURE_BYTES) return false;
    return bytesEqual(signature, fakeSign(publicKey, message));
  },
};

/** A `SignatureVerifier` that rejects everything, for failure-path tests. */
export const rejectingVerifier: SignatureVerifier = {
  verifyEd25519: () => false,
};

/** Deterministic filler bytes, so a test can produce a distinct key or digest by seed. */
export function seededBytes(length: number, seed: number): Bytes {
  const out = new Uint8Array(length);
  let h = (seed + 1) >>> 0;
  for (let i = 0; i < length; i += 1) {
    h = Math.imul(h ^ (i + 0x9e3779b9), 0x85ebca6b) >>> 0;
    out[i] = h & 0xff;
  }
  return out;
}
