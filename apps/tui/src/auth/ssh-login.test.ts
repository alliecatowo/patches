import { buildSshChallengeBlob, SSH_LOGIN_DOMAIN_SEPARATOR } from '@patches/domain';
import { dateToTimestamp } from '@patches/proto';
import type { BeginSshLoginResponse, CompleteSshLoginResponse } from '../api/wire/types.js';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  encodeFrame,
  encodeString,
  SSH_AGENT_MESSAGE,
  SshFrameReader,
  SshWireReader,
} from './ssh-agent.js';
import {
  describeIdentities,
  formatOpenSshPublicKey,
  parseOpenSshPublicKey,
  performSshLogin,
  readPublicKeyFile,
  selectIdentity,
  signFlagsForAlgorithm,
  sshFingerprint,
} from './ssh-login.js';

const ED25519_BLOB = Buffer.concat([encodeString('ssh-ed25519'), Buffer.from([1, 2, 3, 4])]);
const RSA_BLOB = Buffer.concat([encodeString('ssh-rsa'), Buffer.from([9, 9])]);

describe('OpenSSH public key parsing', () => {
  it('parses algorithm, base64 blob and comment', () => {
    const blob = Buffer.from([1, 2, 3]);
    const line = formatOpenSshPublicKey('ssh-ed25519', blob, 'alice@laptop');
    const parsed = parseOpenSshPublicKey(line);
    expect(parsed.algorithm).toBe('ssh-ed25519');
    expect(parsed.blob.equals(blob)).toBe(true);
    expect(parsed.comment).toBe('alice@laptop');
  });

  it('tolerates a missing comment', () => {
    const parsed = parseOpenSshPublicKey(formatOpenSshPublicKey('ssh-ed25519', Buffer.from([1])));
    expect(parsed.comment).toBe('');
  });

  it('rejects a line with no base64 field', () => {
    expect(() => parseOpenSshPublicKey('ssh-ed25519')).toThrow(/valid OpenSSH public key/);
  });

  it('reads and parses a .pub file from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'patches-pubkey-'));
    try {
      const path = join(dir, 'id_ed25519.pub');
      await writeFile(
        path,
        `${formatOpenSshPublicKey('ssh-ed25519', Buffer.from([1, 2]), 'work')}\n`,
      );
      const parsed = await readPublicKeyFile(path);
      expect(parsed.algorithm).toBe('ssh-ed25519');
      expect(parsed.comment).toBe('work');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('sshFingerprint', () => {
  it('is stable, base64, and unpadded', () => {
    const fp = sshFingerprint(ED25519_BLOB);
    expect(fp).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
    expect(fp).not.toContain('=');
    expect(sshFingerprint(ED25519_BLOB)).toBe(fp);
  });

  it('differs for different key material', () => {
    expect(sshFingerprint(ED25519_BLOB)).not.toBe(sshFingerprint(RSA_BLOB));
  });
});

describe('signFlagsForAlgorithm', () => {
  it('requests rsa-sha2-512 for ssh-rsa keys', () => {
    expect(signFlagsForAlgorithm('ssh-rsa')).toBe(0x04);
  });

  it('requests no special flag for ed25519', () => {
    expect(signFlagsForAlgorithm('ssh-ed25519')).toBe(0);
  });
});

describe('buildSshChallengeBlob (A-020: shared with apps/server via @patches/domain)', () => {
  it('encodes fields in the fixed order, each length-prefixed', () => {
    const expiresAt = new Date('2026-08-18T00:00:00.000Z');
    const blob = buildSshChallengeBlob({
      domainSeparator: SSH_LOGIN_DOMAIN_SEPARATOR,
      nodeDomain: 'patches.example',
      challengeId: 'challenge-1',
      nonce: Buffer.from([1, 2, 3]),
      fingerprint: 'SHA256:abc',
      expiresAt,
    });

    const reader = new SshWireReader(blob);
    expect(reader.readString().toString('utf8')).toBe(SSH_LOGIN_DOMAIN_SEPARATOR);
    expect(reader.readString().toString('utf8')).toBe('patches.example');
    expect(reader.readString().toString('utf8')).toBe('challenge-1');
    expect([...reader.readString()]).toEqual([1, 2, 3]);
    expect(reader.readString().toString('utf8')).toBe('SHA256:abc');
    expect(reader.readString().toString('utf8')).toBe(
      String(Math.floor(expiresAt.getTime() / 1000)),
    );
    expect(reader.remaining).toBe(0);
  });

  /** Parity fixture pinned in `@patches/domain`'s own test (A-020): both this client and
   * `apps/server` import the same `buildSshChallengeBlob`, so this is really a "did the
   * import wire up correctly" check rather than a from-scratch byte comparison. */
  it('matches the pinned domain-package fixture byte-for-byte', () => {
    const fixture = {
      domainSeparator: SSH_LOGIN_DOMAIN_SEPARATOR,
      nodeDomain: 'example.test',
      challengeId: '11111111-1111-4111-8111-111111111111',
      nonce: Buffer.from('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex'),
      fingerprint: 'SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCD',
      expiresAt: new Date('2026-08-17T12:00:00Z'),
    };
    expect(buildSshChallengeBlob(fixture).toString('hex')).toBe(
      '00000014706174636865732d7373682d6c6f67696e2d76310000000c6578616d706c652e746573740000002431313131313131312d313131312d343131312d383131312d3131313131313131313131310000001f0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0000002f5348413235363a6162636465666768696a6b6c6d6e6f707172737475767778797a30313233343536373839414243440000000a31373836393638303030',
    );
  });
});

describe('describeIdentities / selectIdentity', () => {
  const identities = describeIdentities([
    { keyBlob: ED25519_BLOB, comment: 'alice@laptop' },
    { keyBlob: RSA_BLOB, comment: 'alice@desktop' },
  ]);

  it('annotates each identity with its fingerprint and algorithm', () => {
    expect(identities[0]?.algorithm).toBe('ssh-ed25519');
    expect(identities[1]?.algorithm).toBe('ssh-rsa');
    expect(identities[0]?.fingerprint).toMatch(/^SHA256:/);
  });

  it('auto-selects the sole identity when no selector is given and only one is loaded', () => {
    expect(selectIdentity([identities[0]!])).toBe(identities[0]);
  });

  it('refuses to guess when multiple identities are loaded and no selector is given', () => {
    expect(selectIdentity(identities)).toBeUndefined();
  });

  it('selects by exact fingerprint or by comment', () => {
    expect(selectIdentity(identities, identities[1]?.fingerprint)).toBe(identities[1]);
    expect(selectIdentity(identities, 'alice@desktop')).toBe(identities[1]);
  });

  it('selects by a fingerprint suffix', () => {
    const fp = identities[0]?.fingerprint ?? '';
    expect(selectIdentity(identities, fp.slice(-10))).toBe(identities[0]);
  });
});

function startFakeAgent(handle: (messageType: number, payload: Buffer) => Buffer): {
  path: string;
  server: Server;
  stop: () => Promise<void>;
} {
  const socketPath = join(
    tmpdir(),
    `patches-fake-agent-login-${String(process.pid)}-${String(Math.random()).slice(2)}.sock`,
  );
  const server = createServer((socket: Socket) => {
    const reader = new SshFrameReader();
    socket.on('data', (chunk: Buffer) => {
      for (const frame of reader.push(chunk)) {
        socket.write(handle(frame[0] ?? -1, frame.subarray(1)));
      }
    });
  });
  server.listen(socketPath);
  return {
    path: socketPath,
    server,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe('performSshLogin', () => {
  let agent: ReturnType<typeof startFakeAgent> | undefined;

  afterEach(async () => {
    await agent?.stop();
    agent = undefined;
  });

  it('runs BeginSshLogin -> agent sign -> CompleteSshLogin and binds the signed blob to the challenge', async () => {
    const nonce = Buffer.from([7, 7, 7, 7]);
    const expiresAt = new Date(Date.now() + 60_000);
    const beginResponse: BeginSshLoginResponse = {
      challengeId: 'chal-42',
      nonce,
      expiresAt: dateToTimestamp(expiresAt),
    };
    const completeResponse: CompleteSshLoginResponse = {
      session: {
        accessToken: 'access',
        accessExpiresAt: dateToTimestamp(new Date()),
        refreshToken: 'refresh',
        refreshExpiresAt: dateToTimestamp(new Date()),
        actor: undefined,
        emailVerified: true,
        node: 'patches.example',
      },
    };

    let signedData: Buffer | undefined;
    agent = startFakeAgent((messageType, payload) => {
      expect(messageType).toBe(SSH_AGENT_MESSAGE.SIGN_REQUEST);
      const reader = new SshWireReader(payload);
      reader.readString(); // key blob
      signedData = Buffer.from(reader.readString());
      const signatureBlob = Buffer.concat([
        encodeString('ssh-ed25519'),
        encodeString(Buffer.from('sig')),
      ]);
      return encodeFrame(SSH_AGENT_MESSAGE.SIGN_RESPONSE, encodeString(signatureBlob));
    });

    const beginSshLogin = vi.fn().mockResolvedValue(beginResponse);
    const completeSshLogin = vi.fn().mockResolvedValue(completeResponse);
    const [identity] = describeIdentities([{ keyBlob: ED25519_BLOB, comment: 'alice@laptop' }]);

    const result = await performSshLogin({
      api: { beginSshLogin, completeSshLogin },
      nodeDomain: 'patches.example',
      identity: identity!,
      publicKeyOpenssh: formatOpenSshPublicKey('ssh-ed25519', ED25519_BLOB, 'alice@laptop'),
      socketPath: agent.path,
    });

    expect(result).toBe(completeResponse);
    expect(beginSshLogin).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint: identity!.fingerprint }),
    );
    expect(completeSshLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId: 'chal-42',
        signature: Buffer.from('sig'),
        signatureFormat: 'ssh-ed25519',
      }),
    );

    // What actually got signed must be exactly buildSshLoginBlob's output for this challenge.
    const expectedBlob = new SshWireReader(signedData ?? Buffer.alloc(0));
    expect(expectedBlob.readString().toString('utf8')).toBe(SSH_LOGIN_DOMAIN_SEPARATOR);
    expect(expectedBlob.readString().toString('utf8')).toBe('patches.example');
    expect(expectedBlob.readString().toString('utf8')).toBe('chal-42');
  });
});
