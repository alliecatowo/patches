/**
 * Shared types for the E2EE DM contract (ADR 0020, P13-001).
 *
 * This package is the **contract**, not the implementation. It deliberately imports no crypto
 * library: every signature check, digest, and franking check is an interface the caller injects
 * (`SignatureVerifier`, `DigestFunction`, `FrankingVerifier`), so `@patches/domain` stays a pure
 * dependency of the TUI, the server, and the worker alike. `@patches/crypto` supplies the real
 * implementations; tests supply fakes.
 *
 * Every validator here is pure and synchronous, and every one of them fails **closed**: an
 * unknown, malformed, or unverifiable input is rejected rather than treated as absent.
 */

/** Raw key/ciphertext/digest bytes. Always `Uint8Array`, never a hex or base64 string. */
export type Bytes = Uint8Array;

/** Ed25519 public key length (RFC 8032). */
export const ED25519_PUBLIC_KEY_BYTES = 32;

/** Ed25519 signature length (RFC 8032). */
export const ED25519_SIGNATURE_BYTES = 64;

/** X25519 public key length (RFC 7748). */
export const X25519_PUBLIC_KEY_BYTES = 32;

/** SHA-256/BLAKE2s-sized digest, used for certificate, roster, ciphertext, and fanout digests. */
export const E2EE_DIGEST_BYTES = 32;

/**
 * Ed25519 verification, injected.
 *
 * Implementations MUST use strict RFC 8032 semantics. noble's default is ZIP-215, which accepts
 * non-canonical encodings and small-order points; protocol signatures verified under ZIP-215 are
 * not the signatures this contract describes (`docs/research/e2ee-dms.md` §5).
 *
 * Implementations MUST return `false` on malformed input rather than throwing, so a hostile
 * server cannot turn a bad signature into an exception path the caller handles differently from
 * a rejection.
 */
export interface SignatureVerifier {
  verifyEd25519(input: {
    readonly publicKey: Bytes;
    readonly message: Bytes;
    readonly signature: Bytes;
  }): boolean;
}

/** A collision-resistant digest over canonical bytes, injected for the same reason. */
export type DigestFunction = (input: Bytes) => Bytes;

/** Byte-for-byte comparison. Not constant-time — only ever used on public, already-signed data. */
export function bytesEqual(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** True when every byte is zero — the genesis `previous_digest` of a roster chain. */
export function isZeroBytes(value: Bytes): boolean {
  for (const byte of value) {
    if (byte !== 0) return false;
  }
  return true;
}
