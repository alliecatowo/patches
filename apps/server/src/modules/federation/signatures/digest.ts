import { createHash } from 'node:crypto';

/** `Digest: SHA-256=<base64>` (RFC 3230 + RFC 5843), the body-integrity header every signed
 * federation request carries and every signature covers via `headers="... digest"`
 * (`docs/research/activitypub.md`). */
export function computeDigestHeader(body: Buffer | string): string {
  const hash = createHash('sha256').update(body).digest('base64');
  return `SHA-256=${hash}`;
}

/** Verifies a peer-supplied `Digest` header against the exact bytes received. Case-
 * insensitive on the `SHA-256=` algorithm token (Mastodon and other implementations vary
 * casing); rejects anything that isn't the `SHA-256` algorithm outright rather than silently
 * accepting a weaker one. */
export function verifyDigestHeader(digestHeader: string, body: Buffer): boolean {
  const match = /^sha-256=(.+)$/i.exec(digestHeader.trim());
  if (match?.[1] === undefined) return false;
  const expected = computeDigestHeader(body);
  const actual = `SHA-256=${match[1]}`;
  return timingSafeEqualStrings(expected, actual);
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
