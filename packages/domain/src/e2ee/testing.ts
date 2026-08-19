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
 * A deterministic 32-byte mixing function over four independent 32-bit lanes.
 *
 * Four lanes and two passes, not one FNV chain: a single 32-bit chain expanded to 32 bytes has
 * only 32 bits of real entropy, and a property test over short inputs finds a collision in a few
 * hundred runs — which shows up as a *contract* test failing for a reason that has nothing to do
 * with the contract. Collision-resistant enough that "the digests disagree" is meaningful here;
 * nothing more is claimed, and this is never used outside tests.
 */
export const fakeDigest: DigestFunction = (input: Bytes): Bytes => {
  const primes = [0x01000193, 0x85ebca6b, 0xcc9e2d51, 0x27d4eb2f];
  const lanes = [0x811c9dc5, 0x9e3779b9, 0x6a09e667, 0xbb67ae85];
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < input.length; i += 1) {
      const byte = input[i] ?? 0;
      for (let lane = 0; lane < 4; lane += 1) {
        const mixed = Math.imul(lanes[lane]! ^ (byte + lane + i + pass * 31), primes[lane]!) >>> 0;
        lanes[lane] = ((mixed << 13) | (mixed >>> 19)) >>> 0;
      }
    }
    for (let lane = 0; lane < 4; lane += 1) {
      lanes[lane] = Math.imul(lanes[lane]! ^ input.length, primes[lane]!) >>> 0;
    }
  }
  const out = new Uint8Array(E2EE_DIGEST_BYTES);
  for (let i = 0; i < E2EE_DIGEST_BYTES; i += 1) {
    const lane = i & 3;
    lanes[lane] = Math.imul(lanes[lane]! ^ (i + 0x9e37), primes[lane]!) >>> 0;
    out[i] = (lanes[lane] >>> 24) & 0xff;
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
