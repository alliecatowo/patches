import { createHash, createPublicKey, type KeyObject, verify as cryptoVerify } from 'node:crypto';

import { SshReader, SshWireError } from '@patches/domain';

import { DER_OIDS, ED25519_SPKI_PREFIX, derBitString, derInteger, derSequence } from './der.js';

/**
 * OpenSSH public keys and signatures (spec §166, `docs/architecture/auth.md` §4).
 *
 * Patches never implements SSH and never touches a private key — signing happens in the
 * user's agent (RFC 9987 §5.6, which has the agent sign client-supplied opaque data). All
 * this module does is turn the two public artefacts the agent hands back, an OpenSSH public
 * key blob and an SSH signature blob, into something `node:crypto` can verify.
 *
 * SHA-1 `ssh-rsa` is rejected outright: an `ssh-rsa` *key* is fine, but it must be used with
 * an `rsa-sha2-256`/`rsa-sha2-512` signature (RFC 8332). Accepting the SHA-1 name would let a
 * client downgrade the hash by simply asking for it.
 */

/** Signature algorithm names this node accepts, mapped to their digest for `crypto.verify`. */
const SIGNATURE_ALGORITHMS = {
  // Ed25519 hashes internally; `null` is how node:crypto expects to be told so.
  'ssh-ed25519': { keyAlgorithms: ['ssh-ed25519'], digest: null },
  'rsa-sha2-256': { keyAlgorithms: ['ssh-rsa'], digest: 'sha256' },
  'rsa-sha2-512': { keyAlgorithms: ['ssh-rsa'], digest: 'sha512' },
  'ecdsa-sha2-nistp256': { keyAlgorithms: ['ecdsa-sha2-nistp256'], digest: 'sha256' },
  'ecdsa-sha2-nistp384': { keyAlgorithms: ['ecdsa-sha2-nistp384'], digest: 'sha384' },
  'ecdsa-sha2-nistp521': { keyAlgorithms: ['ecdsa-sha2-nistp521'], digest: 'sha512' },
} as const satisfies Record<string, { keyAlgorithms: readonly string[]; digest: string | null }>;

/**
 * Below this, `ssh-rsa` is rejected outright regardless of signature scheme — RFC 8332's
 * SHA-2 signature schemes fix the SHA-1 downgrade but say nothing about key size, and a 1024-
 * or 1536-bit RSA key is within reach of realistic factoring effort today.
 */
const MIN_RSA_MODULUS_BITS = 2048;

export type SshSignatureAlgorithm = keyof typeof SIGNATURE_ALGORITHMS;

export const ACCEPTED_SIGNATURE_ALGORITHMS = Object.freeze(
  Object.keys(SIGNATURE_ALGORITHMS) as SshSignatureAlgorithm[],
);

const ECDSA_CURVES = {
  'ecdsa-sha2-nistp256': { sshName: 'nistp256', oid: DER_OIDS.secp256r1 },
  'ecdsa-sha2-nistp384': { sshName: 'nistp384', oid: DER_OIDS.secp384r1 },
  'ecdsa-sha2-nistp521': { sshName: 'nistp521', oid: DER_OIDS.secp521r1 },
} as const;

export interface OpenSshPublicKey {
  /** Key algorithm as it appears inside the blob, e.g. `ssh-ed25519`. */
  algorithm: string;
  /** The raw base64-decoded key blob — the exact bytes the fingerprint is taken over. */
  blob: Buffer;
  /** OpenSSH `SHA256:<base64>` fingerprint, the form used as `credentials.identifier`. */
  fingerprint: string;
  comment: string | undefined;
}

/**
 * Parses `ssh-ed25519 AAAAC3... comment` into its parts.
 *
 * The algorithm named in the text prefix must equal the one inside the blob: they are
 * independent inputs, and trusting the unauthenticated text half would let a client mislabel
 * a key.
 */
export function parseOpenSshPublicKey(text: string): OpenSshPublicKey {
  const parts = text.trim().split(/\s+/);
  const [declaredAlgorithm, encoded, ...commentParts] = parts;
  if (declaredAlgorithm === undefined || encoded === undefined) {
    throw new SshWireError('not an OpenSSH public key line');
  }

  const blob = Buffer.from(encoded, 'base64');
  // `Buffer.from(..., 'base64')` skips invalid characters instead of failing, so the
  // round-trip is what actually rejects a corrupted key.
  if (
    blob.length === 0 ||
    blob.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')
  ) {
    throw new SshWireError('OpenSSH public key body is not valid base64');
  }

  const reader = new SshReader(blob);
  const algorithm = reader.readUtf8String();
  if (algorithm !== declaredAlgorithm) {
    throw new SshWireError('OpenSSH public key algorithm does not match its blob');
  }

  const comment = commentParts.length === 0 ? undefined : commentParts.join(' ');
  return { algorithm, blob, fingerprint: sshFingerprint(blob), comment };
}

/**
 * OpenSSH's `SHA256:<base64>` fingerprint: base64 of the SHA-256 of the key blob, with `=`
 * padding stripped — exactly what `ssh-keygen -lf` prints.
 */
export function sshFingerprint(blob: Buffer): string {
  return `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`;
}

/**
 * Verifies an SSH signature blob (`string algorithm; string signature`, RFC 4253 §6.6) over
 * `data` with `key`.
 *
 * Returns `false` for every failure, including a malformed blob or an unsupported algorithm:
 * the caller reports one uniform `UNAUTHENTICATED` regardless (spec §166's no-enumeration
 * rule), so distinguishing them here would only invite a caller to leak the difference.
 */
export function verifySshSignature(
  key: OpenSshPublicKey,
  data: Buffer,
  signatureBlob: Buffer,
): boolean {
  try {
    const reader = new SshReader(signatureBlob);
    const algorithm = reader.readUtf8String();
    const rawSignature = reader.readString();
    reader.expectEnd();

    if (!isAcceptedAlgorithm(algorithm)) return false;
    const spec = SIGNATURE_ALGORITHMS[algorithm];
    // `as readonly string[]`: `satisfies` narrows each entry to a literal tuple, which makes
    // `includes` demand a literal rather than the parsed string being checked.
    if (!(spec.keyAlgorithms as readonly string[]).includes(key.algorithm)) return false;

    const publicKey = toKeyObject(key);
    const signature = algorithm.startsWith('ecdsa-')
      ? ecdsaSignatureToDer(rawSignature)
      : rawSignature;

    return cryptoVerify(spec.digest, data, publicKey, signature);
  } catch {
    // Malformed key/signature material. Deliberately swallowed: every failure mode of this
    // function is the same answer to the caller ("authentication failed"), and the inputs are
    // attacker-supplied, so there is nothing here worth surfacing or logging per attempt.
    return false;
  }
}

/** `true` only for names in {@link SIGNATURE_ALGORITHMS} — notably not SHA-1 `ssh-rsa`. */
export function isAcceptedAlgorithm(name: string): name is SshSignatureAlgorithm {
  return Object.hasOwn(SIGNATURE_ALGORITHMS, name);
}

/**
 * Bit length of an SSH `mpint` (RFC 4251 §5: two's-complement big-endian, with a leading
 * `0x00` byte when the value would otherwise read as negative). `modulus` is always positive
 * here, so this is just "how many significant bits after the sign-padding is stripped".
 */
function mpintBitLength(value: Buffer): number {
  let index = 0;
  while (index < value.length && value[index] === 0) index += 1;
  if (index === value.length) return 0;

  const firstByte = value[index] as number;
  const significantBitsInFirstByte = 32 - Math.clz32(firstByte);
  return (value.length - index - 1) * 8 + significantBitsInFirstByte;
}

/** Re-frames an OpenSSH key blob as DER so `node:crypto` will load it. */
function toKeyObject(key: OpenSshPublicKey): KeyObject {
  const reader = new SshReader(key.blob);
  const algorithm = reader.readUtf8String();

  if (algorithm === 'ssh-ed25519') {
    const point = reader.readString();
    reader.expectEnd();
    if (point.length !== 32) throw new SshWireError('ed25519 public key must be 32 bytes');
    return createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, point]),
      format: 'der',
      type: 'spki',
    });
  }

  if (algorithm === 'ssh-rsa') {
    // OpenSSH orders these exponent-first; PKCS#1 RSAPublicKey is modulus-first.
    const exponent = reader.readString();
    const modulus = reader.readString();
    reader.expectEnd();
    if (mpintBitLength(modulus) < MIN_RSA_MODULUS_BITS) {
      // An `ssh-rsa` *key* below the modern floor: reject it the same as any other malformed
      // key material (RFC 8332's SHA-2 signature schemes say nothing about key size, so this
      // is Patches' own baseline, not something the wire format enforces for us).
      throw new SshWireError(`ssh-rsa modulus is weaker than ${String(MIN_RSA_MODULUS_BITS)} bits`);
    }
    return createPublicKey({
      key: derSequence([derInteger(modulus), derInteger(exponent)]),
      format: 'der',
      type: 'pkcs1',
    });
  }

  if (Object.hasOwn(ECDSA_CURVES, algorithm)) {
    const curve = ECDSA_CURVES[algorithm as keyof typeof ECDSA_CURVES];
    const curveName = reader.readUtf8String();
    const point = reader.readString();
    reader.expectEnd();
    if (curveName !== curve.sshName) throw new SshWireError('ecdsa curve name mismatch');
    // 0x04 marks an uncompressed point; OpenSSH only ever emits that form.
    if (point[0] !== 0x04) throw new SshWireError('unsupported ecdsa point encoding');
    return createPublicKey({
      key: derSequence([derSequence([DER_OIDS.ecPublicKey, curve.oid]), derBitString(point)]),
      format: 'der',
      type: 'spki',
    });
  }

  throw new SshWireError(`unsupported ssh key algorithm: ${algorithm}`);
}

/** SSH ECDSA signatures are `string r; string s` (mpints); node:crypto wants DER by default. */
function ecdsaSignatureToDer(raw: Buffer): Buffer {
  const reader = new SshReader(raw);
  const r = reader.readString();
  const s = reader.readString();
  reader.expectEnd();
  return derSequence([derInteger(r), derInteger(s)]);
}

/**
 * The algorithm name a signature blob declares, or `undefined` if it is not readable. Used
 * only to cross-check the client's separately-declared `signature_format` field; the
 * authoritative name is always the one inside the blob.
 */
export function readSshSignatureAlgorithm(signatureBlob: Buffer): string | undefined {
  try {
    return new SshReader(signatureBlob).readUtf8String();
  } catch {
    // Unreadable blob: the caller treats "no algorithm" exactly like a mismatch.
    return undefined;
  }
}
