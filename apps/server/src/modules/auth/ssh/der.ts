/**
 * The minimum of DER needed to hand an OpenSSH-format public key to Node's `crypto`, which
 * only accepts PEM/DER key formats — there is no "import an OpenSSH public key" API. The
 * conversions are structural (re-wrapping the same numbers in different framing); no
 * cryptography happens here.
 */

const TAG_INTEGER = 0x02;
const TAG_BIT_STRING = 0x03;
const TAG_SEQUENCE = 0x30;

/** DER definite-length encoding: short form below 128, long form above. */
function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining = Math.floor(remaining / 256)) {
    bytes.unshift(remaining % 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content]);
}

/**
 * DER `INTEGER` from an SSH `mpint`. SSH already stores two's-complement big-endian with a
 * leading `0x00` where the high bit would otherwise make the value negative — the same rule
 * DER uses — but leading zero padding is normalized here so both encodings agree exactly.
 */
export function derInteger(value: Buffer): Buffer {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0x00) start += 1;
  const trimmed = value.subarray(start);
  const first = trimmed[0] ?? 0x00;
  const body = (first & 0x80) === 0 ? trimmed : Buffer.concat([Buffer.from([0x00]), trimmed]);
  return tlv(TAG_INTEGER, body);
}

export function derSequence(items: readonly Buffer[]): Buffer {
  return tlv(TAG_SEQUENCE, Buffer.concat(items));
}

/** DER `BIT STRING` with zero unused trailing bits (the only case needed here). */
export function derBitString(content: Buffer): Buffer {
  return tlv(TAG_BIT_STRING, Buffer.concat([Buffer.from([0x00]), content]));
}

/** Pre-encoded DER `OBJECT IDENTIFIER` values, taken from their defining specifications. */
export const DER_OIDS = {
  /** 1.2.840.10045.2.1 id-ecPublicKey (RFC 5480 §2.1.1). */
  ecPublicKey: Buffer.from('06072a8648ce3d0201', 'hex'),
  /** 1.2.840.10045.3.1.7 secp256r1 / NIST P-256 (RFC 5480 §2.1.1.1). */
  secp256r1: Buffer.from('06082a8648ce3d030107', 'hex'),
  /** 1.3.132.0.34 secp384r1 / NIST P-384. */
  secp384r1: Buffer.from('06052b81040022', 'hex'),
  /** 1.3.132.0.35 secp521r1 / NIST P-521. */
  secp521r1: Buffer.from('06052b81040023', 'hex'),
} as const;

/**
 * SubjectPublicKeyInfo prefix for an Ed25519 key (RFC 8410 §4): the whole structure is fixed
 * except for the 32-byte key, so it is a constant rather than four nested `tlv()` calls.
 */
export const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
