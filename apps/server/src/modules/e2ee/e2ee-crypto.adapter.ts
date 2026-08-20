import { sha256Hash, verifyStrict } from '@patches/crypto';
import type { DigestFunction, SignatureVerifier } from '@patches/domain';

/**
 * Injects `@patches/crypto`'s primitives into `@patches/domain`'s pure validators (ADR 0020
 * §14.14.2). `verifyStrict` uses `{ zip215: false }` — strict RFC 8032 semantics, not noble's
 * default ZIP-215 mode, exactly as `SignatureVerifier`'s contract requires.
 */
export const e2eeSignatureVerifier: SignatureVerifier = {
  verifyEd25519({ publicKey, message, signature }): boolean {
    try {
      return verifyStrict(publicKey, message, signature);
    } catch {
      // SignatureVerifier's contract requires `false` on malformed input, never a throw — a
      // hostile caller must not be able to turn a bad signature into a different code path.
      return false;
    }
  },
};

export const e2eeDigest: DigestFunction = (input) => sha256Hash(input);
