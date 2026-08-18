import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM at-rest encryption for `federation_keys.private_key_*` (B-026). Plain
 * `node:crypto`, no TypeORM/Nest dependency, so both `apps/server` (`KeyService`, which
 * creates/decrypts keys) and `apps/worker` (`FederationDeliverHandler`, which only decrypts to
 * sign outgoing deliveries) can share the exact same cipher rather than each re-deriving it —
 * a mismatch here would silently produce undecryptable ciphertext for the other process.
 *
 * `FEDERATION_KEY_ENCRYPTION_KEY` is a base64-encoded 32-byte key (`openssl rand -base64 32`),
 * required on every node that has `FEDERATION_ENABLED=true` (validated in each app's env
 * schema, not here — this module only enforces the decoded length, since a wrong-length key
 * would silently produce a `createCipheriv` `ERR_CRYPTO_INVALID_KEYLEN` deep in a request path
 * otherwise).
 */

const ALGORITHM = 'aes-256-gcm';
/** 96-bit nonce — the length AES-GCM is specified and optimized for (a longer IV is hashed
 * down internally, which is both slower and no more secure here). */
const IV_BYTES = 12;
const KEY_BYTES = 32;

export interface EncryptedFederationPrivateKey {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/** Encrypts a PKCS#8 PEM private key for storage in `federation_keys`. A fresh random IV is
 * generated per call — GCM's confidentiality guarantee depends on an IV never repeating under
 * the same key, so this must never be memoized or derived deterministically from `actorId`. */
export function encryptFederationPrivateKeyPem(
  privateKeyPem: string,
  encryptionKeyBase64: string,
): EncryptedFederationPrivateKey {
  const key = decodeEncryptionKey(encryptionKeyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKeyPem, 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

/** Decrypts a `federation_keys` row back to the PEM `KeyService`/`FederationDeliverHandler`
 * need to sign with. Throws (rather than returning something invalid) if `tag` doesn't
 * authenticate — a wrong key or corrupted ciphertext must never silently produce garbage that
 * then fails somewhere less obvious. */
export function decryptFederationPrivateKeyPem(
  encrypted: EncryptedFederationPrivateKey,
  encryptionKeyBase64: string,
): string {
  const key = decodeEncryptionKey(encryptionKeyBase64);
  const decipher = createDecipheriv(ALGORITHM, key, encrypted.iv);
  decipher.setAuthTag(encrypted.tag);
  const plaintext = Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

function decodeEncryptionKey(encryptionKeyBase64: string): Buffer {
  const key = Buffer.from(encryptionKeyBase64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `FEDERATION_KEY_ENCRYPTION_KEY must decode to exactly ${String(KEY_BYTES)} bytes ` +
        `(got ${String(key.length)}) — generate one with \`openssl rand -base64 32\`.`,
    );
  }
  return key;
}
