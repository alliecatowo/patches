import { clean } from '@noble/ciphers/utils.js';

/**
 * Best-effort in-place zeroization of secret byte buffers: root/chain/message/header keys,
 * DH private keys, franking openings, and skipped-message-key material.
 *
 * Limits (do not treat this as a security boundary): JavaScript engines can retain copies
 * created by string conversion, structured cloning, JIT inlining, or garbage-collector
 * compaction; `clean()` only overwrites the exact `Uint8Array` views passed to it. Secrets
 * must still live only in an encrypted client vault (see the package README's "State commit
 * contract"), and this function must be called on every path that finishes with a secret —
 * session close, key rotation, and immediately after a value's last use — not only on success.
 */
export function zeroize(...secrets: readonly (Uint8Array | undefined)[]): void {
  for (const secret of secrets) {
    if (secret !== undefined) clean(secret);
  }
}

/** Zeroizes every buffer produced by an iterable, e.g. a skipped-message-key cache's values. */
export function zeroizeAll(secrets: Iterable<Uint8Array | undefined>): void {
  for (const secret of secrets) zeroize(secret);
}
