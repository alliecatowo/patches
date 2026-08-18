import { createSign, createVerify } from 'node:crypto';

import { SIGNATURE_CLOCK_SKEW_MS } from '../federation.constants.js';

/**
 * `draft-cavage-http-signatures-12` signing/verification (P8-005,
 * `docs/research/activitypub.md`) — the scheme Mastodon and the rest of the Fediverse
 * actually run in production. Deliberately isolated from the AS2/activity code: the signing-
 * string builder here takes plain header values, not an activity object, so an RFC 9421
 * implementation can be added later (`docs/research/activitypub.md`'s F2 note) as a sibling
 * module without this one changing.
 */

const SIGNED_HEADERS = ['(request-target)', 'host', 'date', 'digest'] as const;

export interface SignRequestInput {
  method: string;
  /** Path + query, e.g. `/users/bob/inbox`. */
  target: string;
  host: string;
  date: string;
  digest: string;
  keyId: string;
  privateKeyPem: string;
}

/** Builds the `Signature` header value for an outgoing request. */
export function signRequest(input: SignRequestInput): string {
  const signingString = buildSigningString({
    method: input.method,
    target: input.target,
    host: input.host,
    date: input.date,
    digest: input.digest,
  });
  const signature = createSign('RSA-SHA256')
    .update(signingString)
    .end()
    .sign(input.privateKeyPem, 'base64');
  return `keyId="${input.keyId}",algorithm="rsa-sha256",headers="${SIGNED_HEADERS.join(' ')}",signature="${signature}"`;
}

function buildSigningString(parts: {
  method: string;
  target: string;
  host: string;
  date: string;
  digest: string;
}): string {
  return [
    `(request-target): ${parts.method.toLowerCase()} ${parts.target}`,
    `host: ${parts.host}`,
    `date: ${parts.date}`,
    `digest: ${parts.digest}`,
  ].join('\n');
}

export interface ParsedSignatureHeader {
  keyId: string;
  algorithm: string;
  headers: string[];
  signature: string;
}

/** Parses the `Signature: keyId="...", algorithm="...", headers="...", signature="..."`
 * header into its named parameters. Returns `undefined` if any required parameter is
 * missing — the caller treats that as "reject, do not process". */
export function parseSignatureHeader(value: string): ParsedSignatureHeader | undefined {
  const params = new Map<string, string>();
  const paramPattern = /(\w+)="((?:[^"\\]|\\.)*)"/g;
  for (const match of value.matchAll(paramPattern)) {
    const key = match[1];
    const raw = match[2];
    if (key === undefined || raw === undefined) continue;
    params.set(key, raw.replace(/\\"/g, '"'));
  }
  const keyId = params.get('keyId');
  const signature = params.get('signature');
  if (keyId === undefined || signature === undefined) return undefined;
  const algorithm = params.get('algorithm') ?? 'rsa-sha256';
  const headers = (params.get('headers') ?? '(request-target) host date').split(/\s+/);
  return { keyId, algorithm, headers, signature };
}

export interface VerifyRequestInput {
  method: string;
  target: string;
  /** Every relevant request header, lowercased keys, single string value. */
  headers: Readonly<Record<string, string>>;
  publicKeyPem: string;
  /** Injectable clock for tests. */
  now?: Date;
}

export type SignatureVerificationFailure =
  | 'MISSING_SIGNATURE_HEADER'
  | 'UNSUPPORTED_ALGORITHM'
  | 'MISSING_REQUIRED_SIGNED_HEADER'
  | 'MISSING_DATE_HEADER'
  | 'CLOCK_SKEW'
  | 'INVALID_DIGEST'
  | 'BAD_SIGNATURE';

export type SignatureVerificationResult =
  { ok: true; keyId: string } | { ok: false; reason: SignatureVerificationFailure };

/** Requires `(request-target)`, `host`, `date`, and `digest` to all be in the signed header
 * set — accepting a signature that omits `digest` would let a peer sign the envelope but swap
 * the body freely, and omitting `date` would defeat the clock-skew replay defense entirely. */
const REQUIRED_SIGNED_HEADERS = ['(request-target)', 'host', 'date', 'digest'];

export function verifyRequestSignature(input: VerifyRequestInput): SignatureVerificationResult {
  const signatureHeader = input.headers.signature;
  if (signatureHeader === undefined) return { ok: false, reason: 'MISSING_SIGNATURE_HEADER' };
  const parsed = parseSignatureHeader(signatureHeader);
  if (parsed === undefined) return { ok: false, reason: 'MISSING_SIGNATURE_HEADER' };
  if (parsed.algorithm.toLowerCase() !== 'rsa-sha256') {
    return { ok: false, reason: 'UNSUPPORTED_ALGORITHM' };
  }
  for (const required of REQUIRED_SIGNED_HEADERS) {
    if (!parsed.headers.includes(required)) {
      return { ok: false, reason: 'MISSING_REQUIRED_SIGNED_HEADER' };
    }
  }

  const dateHeader = input.headers.date;
  if (dateHeader === undefined) return { ok: false, reason: 'MISSING_DATE_HEADER' };
  const requestDate = new Date(dateHeader);
  const now = input.now ?? new Date();
  if (Number.isNaN(requestDate.getTime())) return { ok: false, reason: 'MISSING_DATE_HEADER' };
  if (Math.abs(now.getTime() - requestDate.getTime()) > SIGNATURE_CLOCK_SKEW_MS) {
    return { ok: false, reason: 'CLOCK_SKEW' };
  }

  const signingLines = parsed.headers.map((headerName) => {
    if (headerName === '(request-target)') {
      return `(request-target): ${input.method.toLowerCase()} ${input.target}`;
    }
    const value = input.headers[headerName];
    return `${headerName}: ${value ?? ''}`;
  });
  const signingString = signingLines.join('\n');

  const verifier = createVerify('RSA-SHA256').update(signingString).end();
  let valid: boolean;
  try {
    valid = verifier.verify(input.publicKeyPem, parsed.signature, 'base64');
  } catch {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }
  if (!valid) return { ok: false, reason: 'BAD_SIGNATURE' };
  return { ok: true, keyId: parsed.keyId };
}
