import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { computeDigestHeader, verifyDigestHeader } from './digest.js';
import { signRequest, verifyRequestSignature } from './http-signature.js';

function keyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

describe('HTTP Signatures (draft-cavage-http-signatures-12)', () => {
  it('verifies a signature this signer produced, through this verifier (self-interop)', () => {
    const { publicKeyPem, privateKeyPem } = keyPair();
    const body = JSON.stringify({ type: 'Follow' });
    const digest = computeDigestHeader(body);
    const date = new Date().toUTCString();
    const target = '/users/bob/inbox';
    const host = 'b.localhost:4001';
    const keyId = 'https://a.localhost:4000/users/alice#main-key';

    const signature = signRequest({
      method: 'POST',
      target,
      host,
      date,
      digest,
      keyId,
      privateKeyPem,
    });

    const result = verifyRequestSignature({
      method: 'POST',
      target,
      headers: { signature, host, date, digest },
      publicKeyPem,
    });

    expect(result).toEqual({ ok: true, keyId });
  });

  it('rejects a signature verified against the wrong key', () => {
    const signer = keyPair();
    const other = keyPair();
    const digest = computeDigestHeader('{}');
    const date = new Date().toUTCString();
    const signature = signRequest({
      method: 'POST',
      target: '/inbox',
      host: 'b.localhost',
      date,
      digest,
      keyId: 'k',
      privateKeyPem: signer.privateKeyPem,
    });

    const result = verifyRequestSignature({
      method: 'POST',
      target: '/inbox',
      headers: { signature, host: 'b.localhost', date, digest },
      publicKeyPem: other.publicKeyPem,
    });

    expect(result).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects a tampered method/target (the signature covers (request-target))', () => {
    const { publicKeyPem, privateKeyPem } = keyPair();
    const digest = computeDigestHeader('{}');
    const date = new Date().toUTCString();
    const signature = signRequest({
      method: 'POST',
      target: '/inbox',
      host: 'b.localhost',
      date,
      digest,
      keyId: 'k',
      privateKeyPem,
    });

    const result = verifyRequestSignature({
      method: 'POST',
      target: '/admin', // tampered
      headers: { signature, host: 'b.localhost', date, digest },
      publicKeyPem,
    });

    expect(result).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects a request outside the clock-skew tolerance', () => {
    const { publicKeyPem, privateKeyPem } = keyPair();
    const digest = computeDigestHeader('{}');
    const staleDate = new Date(Date.now() - 60 * 60_000).toUTCString();
    const signature = signRequest({
      method: 'POST',
      target: '/inbox',
      host: 'b.localhost',
      date: staleDate,
      digest,
      keyId: 'k',
      privateKeyPem,
    });

    const result = verifyRequestSignature({
      method: 'POST',
      target: '/inbox',
      headers: { signature, host: 'b.localhost', date: staleDate, digest },
      publicKeyPem,
    });

    expect(result).toEqual({ ok: false, reason: 'CLOCK_SKEW' });
  });

  it('rejects when a required signed header (digest) is missing from `headers=`', () => {
    const { publicKeyPem } = keyPair();
    const date = new Date().toUTCString();
    // Hand-built Signature header that omits `digest` from the signed-headers list.
    const signature =
      'keyId="k",algorithm="rsa-sha256",headers="(request-target) host date",signature="x"';

    const result = verifyRequestSignature({
      method: 'POST',
      target: '/inbox',
      headers: { signature, host: 'b.localhost', date, digest: computeDigestHeader('{}') },
      publicKeyPem,
    });

    expect(result).toEqual({ ok: false, reason: 'MISSING_REQUIRED_SIGNED_HEADER' });
  });
});

describe('Digest header', () => {
  it('round-trips SHA-256=<base64> and verifies against the exact bytes', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    const header = computeDigestHeader(body);
    expect(header).toMatch(/^SHA-256=/);
    expect(verifyDigestHeader(header, body)).toBe(true);
  });

  it('rejects a digest that does not match the body', () => {
    const header = computeDigestHeader('one');
    expect(verifyDigestHeader(header, Buffer.from('two'))).toBe(false);
  });

  it('is case-insensitive on the algorithm token', () => {
    const body = Buffer.from('x');
    const header = computeDigestHeader(body).replace('SHA-256', 'sha-256');
    expect(verifyDigestHeader(header, body)).toBe(true);
  });
});
