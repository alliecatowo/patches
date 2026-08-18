import {
  createSign,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
  createHash,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { buildSshChallengeBlob, SSH_LOGIN_DOMAIN_SEPARATOR } from './challenge-blob.js';
import { parseOpenSshPublicKey, sshFingerprint, verifySshSignature } from './openssh.js';
import { encodeSshStrings, SshReader } from './wire.js';

/**
 * Keys and signatures are produced here with `node:crypto` alone — no `ssh-keygen`, no
 * `ssh-agent` — so the suite runs identically in CI and on a machine with no SSH tooling.
 * The OpenSSH framing is assembled by hand, which also means these tests fail if the
 * production parser and this encoder ever disagree about the format.
 */

function sshEncode(parts: readonly (Buffer | string)[]): Buffer {
  return encodeSshStrings(parts);
}

function ed25519Key(): { publicKeyLine: string; sign: (data: Buffer) => Buffer } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  // RFC 8410 SPKI for Ed25519 is a fixed 12-byte prefix followed by the raw key.
  const raw = spki.subarray(spki.length - 32);
  const blob = sshEncode(['ssh-ed25519', raw]);
  return {
    publicKeyLine: `ssh-ed25519 ${blob.toString('base64')} test@patches`,
    sign: (data) => sshEncode(['ssh-ed25519', cryptoSign(null, data, privateKey)]),
  };
}

function rsaKey(modulusLength = 2048): {
  publicKeyLine: string;
  sign: (data: Buffer, algorithm: 'rsa-sha2-256' | 'rsa-sha2-512' | 'ssh-rsa') => Buffer;
} {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength });
  const pkcs1 = publicKey.export({ format: 'der', type: 'pkcs1' });
  const reader = new DerReader(pkcs1);
  const { modulus, exponent } = reader.readRsaPublicKey();
  const blob = sshEncode(['ssh-rsa', exponent, modulus]);
  return {
    publicKeyLine: `ssh-rsa ${blob.toString('base64')}`,
    sign: (data, algorithm) => {
      const digest = algorithm === 'rsa-sha2-512' ? 'sha512' : 'sha256';
      const signer = createSign(algorithm === 'ssh-rsa' ? 'sha1' : digest);
      signer.update(data);
      return sshEncode([algorithm, signer.sign(privateKey)]);
    },
  };
}

function ecdsaKey(): { publicKeyLine: string; sign: (data: Buffer) => Buffer } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  // The uncompressed point is the tail of the SPKI BIT STRING; it starts at the 0x04 marker.
  const point = spki.subarray(spki.length - 65);
  const blob = sshEncode(['ecdsa-sha2-nistp256', 'nistp256', point]);
  return {
    publicKeyLine: `ecdsa-sha2-nistp256 ${blob.toString('base64')}`,
    sign: (data) => {
      const der = cryptoSign('sha256', data, privateKey);
      const { r, s } = new DerReader(der).readEcdsaSignature();
      return sshEncode(['ecdsa-sha2-nistp256', sshEncode([r, s])]);
    },
  };
}

/** Just enough DER reading to unpack what node:crypto exports, for test fixtures only. */
class DerReader {
  private offset = 0;
  constructor(private readonly buffer: Buffer) {}

  private readLength(): number {
    const first = this.buffer[this.offset] ?? 0;
    this.offset += 1;
    if (first < 0x80) return first;
    let length = 0;
    for (let i = 0; i < (first & 0x7f); i += 1) {
      length = length * 256 + (this.buffer[this.offset] ?? 0);
      this.offset += 1;
    }
    return length;
  }

  private readTlv(): Buffer {
    this.offset += 1; // tag
    const length = this.readLength();
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readRsaPublicKey(): { modulus: Buffer; exponent: Buffer } {
    const sequence = new DerReader(this.readTlv());
    return { modulus: sequence.readTlv(), exponent: sequence.readTlv() };
  }

  readEcdsaSignature(): { r: Buffer; s: Buffer } {
    const sequence = new DerReader(this.readTlv());
    return { r: sequence.readTlv(), s: sequence.readTlv() };
  }
}

const DATA = Buffer.from('the exact bytes the agent was asked to sign');

describe('parseOpenSshPublicKey', () => {
  it('parses an ed25519 key and computes its OpenSSH fingerprint', () => {
    const { publicKeyLine } = ed25519Key();
    const key = parseOpenSshPublicKey(publicKeyLine);

    expect(key.algorithm).toBe('ssh-ed25519');
    expect(key.comment).toBe('test@patches');
    expect(key.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    // Same definition ssh-keygen -lf uses: base64(sha256(blob)) without padding.
    expect(key.fingerprint).toBe(
      `SHA256:${createHash('sha256').update(key.blob).digest('base64').replace(/=+$/, '')}`,
    );
    expect(sshFingerprint(key.blob)).toBe(key.fingerprint);
  });

  it('rejects a key whose text algorithm disagrees with its blob', () => {
    const { publicKeyLine } = ed25519Key();
    const [, body] = publicKeyLine.split(' ');
    expect(() => parseOpenSshPublicKey(`ssh-rsa ${String(body)}`)).toThrow();
  });

  it.each([['not a key'], ['ssh-ed25519'], ['ssh-ed25519 !!!not-base64!!!']])(
    'rejects malformed input %s',
    (input) => {
      expect(() => parseOpenSshPublicKey(input)).toThrow();
    },
  );
});

describe('verifySshSignature', () => {
  it('accepts a valid ed25519 signature', () => {
    const { publicKeyLine, sign } = ed25519Key();
    const key = parseOpenSshPublicKey(publicKeyLine);
    expect(verifySshSignature(key, DATA, sign(DATA))).toBe(true);
  });

  it('rejects an ed25519 signature over different data', () => {
    const { publicKeyLine, sign } = ed25519Key();
    const key = parseOpenSshPublicKey(publicKeyLine);
    expect(verifySshSignature(key, Buffer.from('other data'), sign(DATA))).toBe(false);
  });

  it('rejects a signature made by a different key', () => {
    const { publicKeyLine } = ed25519Key();
    const { sign } = ed25519Key();
    const key = parseOpenSshPublicKey(publicKeyLine);
    expect(verifySshSignature(key, DATA, sign(DATA))).toBe(false);
  });

  it.each(['rsa-sha2-256', 'rsa-sha2-512'] as const)('accepts %s', (algorithm) => {
    const { publicKeyLine, sign } = rsaKey();
    const key = parseOpenSshPublicKey(publicKeyLine);
    expect(verifySshSignature(key, DATA, sign(DATA, algorithm))).toBe(true);
  });

  it('rejects SHA-1 ssh-rsa even when the signature itself is valid (§166)', () => {
    const { publicKeyLine, sign } = rsaKey();
    const key = parseOpenSshPublicKey(publicKeyLine);
    expect(verifySshSignature(key, DATA, sign(DATA, 'ssh-rsa'))).toBe(false);
  });

  it('rejects an ssh-rsa key below the 2048-bit floor, even with a valid signature', () => {
    const { publicKeyLine, sign } = rsaKey(1024);
    const key = parseOpenSshPublicKey(publicKeyLine);
    expect(verifySshSignature(key, DATA, sign(DATA, 'rsa-sha2-256'))).toBe(false);
  });

  it('accepts ecdsa-sha2-nistp256', () => {
    const { publicKeyLine, sign } = ecdsaKey();
    const key = parseOpenSshPublicKey(publicKeyLine);
    expect(verifySshSignature(key, DATA, sign(DATA))).toBe(true);
  });

  it('rejects a truncated or trailing-garbage signature blob', () => {
    const { publicKeyLine, sign } = ed25519Key();
    const key = parseOpenSshPublicKey(publicKeyLine);
    const good = sign(DATA);
    expect(verifySshSignature(key, DATA, good.subarray(0, good.length - 1))).toBe(false);
    expect(verifySshSignature(key, DATA, Buffer.concat([good, Buffer.from([0])]))).toBe(false);
  });
});

describe('buildSshChallengeBlob', () => {
  const input = {
    nodeDomain: 'patches.social',
    challengeId: '3f0c2b3a-0000-4000-8000-000000000000',
    nonce: randomBytes(32),
    fingerprint: 'SHA256:abc',
    expiresAt: new Date('2026-08-17T12:00:00.500Z'),
  };

  it('encodes the §166 fields in order, length-prefixed', () => {
    const reader = new SshReader(buildSshChallengeBlob(input));
    expect(reader.readUtf8String()).toBe(SSH_LOGIN_DOMAIN_SEPARATOR);
    expect(reader.readUtf8String()).toBe(input.nodeDomain);
    expect(reader.readUtf8String()).toBe(input.challengeId);
    expect(reader.readString().equals(input.nonce)).toBe(true);
    expect(reader.readUtf8String()).toBe(input.fingerprint);
    // Whole seconds: the sub-second part of expiresAt is deliberately truncated.
    expect(reader.readUtf8String()).toBe('1786968000');
    expect(reader.atEnd).toBe(true);
  });

  it('changes when any bound field changes', () => {
    const base = buildSshChallengeBlob(input).toString('hex');
    expect(
      buildSshChallengeBlob({ ...input, nodeDomain: 'evil.example' }).toString('hex'),
    ).not.toBe(base);
    expect(buildSshChallengeBlob({ ...input, nonce: randomBytes(32) }).toString('hex')).not.toBe(
      base,
    );
  });
});
