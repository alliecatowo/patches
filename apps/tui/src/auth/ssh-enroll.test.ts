import { createServer, type Server, type Socket } from 'node:net';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SSH_ENROLL_DOMAIN_SEPARATOR } from '@patches/domain';
import { CREDENTIAL_TYPE } from '../api/wire/enums.js';
import { fromDate } from '../api/wire/time.js';
import type { BeginSshEnrollmentResponse } from '../api/wire/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  encodeFrame,
  encodeString,
  encodeUint32,
  SSH_AGENT_MESSAGE,
  SshFrameReader,
  SshWireReader,
} from './ssh-agent.js';
import { describeIdentities } from './ssh-login.js';
import {
  discoverEnrollmentCandidates,
  enrollSshCredential,
  listHomeSshPublicKeys,
} from './ssh-enroll.js';

/** Mirrors `ssh-agent.test.ts`'s fake agent — a real Unix socket speaking just
 * enough RFC 9987 framing to answer `REQUEST_IDENTITIES`/`SIGN_REQUEST`. */
function startFakeAgent(handle: (messageType: number, payload: Buffer) => Buffer): {
  path: string;
  stop: () => Promise<void>;
} {
  const socketPath = join(
    tmpdir(),
    `patches-fake-enroll-agent-${String(process.pid)}-${String(Math.random()).slice(2)}.sock`,
  );
  const server: Server = createServer((socket: Socket) => {
    const reader = new SshFrameReader();
    socket.on('data', (chunk: Buffer) => {
      for (const frame of reader.push(chunk)) {
        const messageType = frame[0] ?? -1;
        socket.write(handle(messageType, frame.subarray(1)));
      }
    });
  });
  server.listen(socketPath);
  return {
    path: socketPath,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const KEY_BLOB = Buffer.concat([encodeString('ssh-ed25519'), Buffer.from([1, 2, 3, 4])]);

function identitiesAnswer(entries: Array<{ keyBlob: Buffer; comment: string }>): Buffer {
  const payload = Buffer.concat([
    encodeUint32(entries.length),
    ...entries.flatMap((entry) => [encodeString(entry.keyBlob), encodeString(entry.comment)]),
  ]);
  return encodeFrame(SSH_AGENT_MESSAGE.IDENTITIES_ANSWER, payload);
}

function signResponse(format: string, signature: string): Buffer {
  const signatureBlob = Buffer.concat([encodeString(format), encodeString(Buffer.from(signature))]);
  return encodeFrame(SSH_AGENT_MESSAGE.SIGN_RESPONSE, encodeString(signatureBlob));
}

describe('listHomeSshPublicKeys', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'patches-ssh-home-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns [] when there is no ~/.ssh directory', async () => {
    await expect(listHomeSshPublicKeys(join(tmpDir, 'no-home'))).resolves.toEqual([]);
  });

  it('parses .pub files and skips everything else', async () => {
    const sshDir = join(tmpDir, '.ssh');
    await mkdir(sshDir, { recursive: true });
    const base64 = KEY_BLOB.toString('base64');
    await writeFile(join(sshDir, 'id_ed25519.pub'), `ssh-ed25519 ${base64} alice@laptop\n`);
    await writeFile(join(sshDir, 'id_ed25519'), 'not a public key, this is the private key file');
    await writeFile(join(sshDir, 'config'), 'Host example.com\n');

    const keys = await listHomeSshPublicKeys(tmpDir);
    expect(keys).toHaveLength(1);
    expect(keys[0]?.path).toBe(join(sshDir, 'id_ed25519.pub'));
  });
});

describe('discoverEnrollmentCandidates', () => {
  let agent: ReturnType<typeof startFakeAgent> | undefined;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'patches-ssh-home-'));
  });

  afterEach(async () => {
    await agent?.stop();
    agent = undefined;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('annotates an agent identity with the matching ~/.ssh/*.pub path', async () => {
    agent = startFakeAgent((messageType) => {
      expect(messageType).toBe(SSH_AGENT_MESSAGE.REQUEST_IDENTITIES);
      return identitiesAnswer([{ keyBlob: KEY_BLOB, comment: 'alice@laptop' }]);
    });

    const sshDir = join(tmpDir, '.ssh');
    await mkdir(sshDir, { recursive: true });
    await writeFile(
      join(sshDir, 'id_ed25519.pub'),
      `ssh-ed25519 ${KEY_BLOB.toString('base64')} alice@laptop\n`,
    );

    const candidates = await discoverEnrollmentCandidates(agent.path, tmpDir);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.comment).toBe('alice@laptop');
    expect(candidates[0]?.knownAt).toEqual([join(sshDir, 'id_ed25519.pub')]);
  });

  it('leaves knownAt empty for an agent identity with no matching ~/.ssh file', async () => {
    agent = startFakeAgent(() => identitiesAnswer([{ keyBlob: KEY_BLOB, comment: 'not-on-disk' }]));
    const candidates = await discoverEnrollmentCandidates(agent.path, tmpDir);
    expect(candidates[0]?.knownAt).toEqual([]);
  });
});

describe('enrollSshCredential (B-021)', () => {
  let agent: ReturnType<typeof startFakeAgent> | undefined;

  afterEach(async () => {
    await agent?.stop();
    agent = undefined;
  });

  it('runs BeginSshEnrollment -> agent sign -> AddCredential with the resulting proof', async () => {
    let signedData: Buffer | undefined;
    agent = startFakeAgent((messageType, payload) => {
      expect(messageType).toBe(SSH_AGENT_MESSAGE.SIGN_REQUEST);
      const reader = new SshWireReader(payload);
      reader.readString(); // key blob
      signedData = Buffer.from(reader.readString());
      return signResponse('ssh-ed25519', 'sig-bytes');
    });
    const [identity] = describeIdentities([{ keyBlob: KEY_BLOB, comment: 'alice@laptop' }]);
    if (identity === undefined) throw new Error('unreachable');

    const beginResponse: BeginSshEnrollmentResponse = {
      challengeId: 'enroll-chal-1',
      nonce: Buffer.from([9, 9, 9, 9]),
      expiresAt: fromDate(new Date(Date.now() + 60_000)),
    };

    let seenBeginRequest: unknown;
    let seenAddRequest: unknown;
    let seenAccessToken: unknown;
    const api = {
      beginSshEnrollment: (request: unknown, accessToken: string) => {
        seenBeginRequest = request;
        seenAccessToken = accessToken;
        return Promise.resolve(beginResponse);
      },
      addCredential: (request: unknown, accessToken: string) => {
        seenAddRequest = request;
        seenAccessToken = accessToken;
        return Promise.resolve({
          credential: {
            id: 'cred-1',
            type: CREDENTIAL_TYPE.SSH_PUBLIC_KEY,
            label: 'laptop',
            identifier: identity.fingerprint,
            createdAt: undefined,
            lastUsedAt: undefined,
          },
        });
      },
    };

    const response = await enrollSshCredential({
      api,
      accessToken: 'access-1',
      nodeDomain: 'patches.example',
      socketPath: agent.path,
      identity,
      label: 'laptop',
    });

    expect(seenAccessToken).toBe('access-1');
    expect(seenBeginRequest).toEqual({
      publicKeyOpenssh: `ssh-ed25519 ${KEY_BLOB.toString('base64')} alice@laptop`,
    });
    expect(seenAddRequest).toEqual({
      type: CREDENTIAL_TYPE.SSH_PUBLIC_KEY,
      secret: `ssh-ed25519 ${KEY_BLOB.toString('base64')} alice@laptop`,
      label: 'laptop',
      sshProof: {
        challengeId: 'enroll-chal-1',
        signature: Buffer.from('sig-bytes'),
        signatureFormat: 'ssh-ed25519',
      },
    });
    expect(response.credential?.identifier).toBe(identity.fingerprint);

    // What actually got signed must be the enroll-domain blob for this exact challenge —
    // distinct from `SSH_LOGIN_DOMAIN_SEPARATOR` (A-020/B-021: shared encoding, different
    // domain separator, so a login signature is never a valid enrollment proof).
    const signedReader = new SshWireReader(signedData ?? Buffer.alloc(0));
    expect(signedReader.readString().toString('utf8')).toBe(SSH_ENROLL_DOMAIN_SEPARATOR);
    expect(signedReader.readString().toString('utf8')).toBe('patches.example');
    expect(signedReader.readString().toString('utf8')).toBe('enroll-chal-1');
    expect([...signedReader.readString()]).toEqual([9, 9, 9, 9]);
    expect(signedReader.readString().toString('utf8')).toBe(identity.fingerprint);
  });

  it('never calls AddCredential when the agent refuses to sign the enrollment challenge', async () => {
    agent = startFakeAgent(() => encodeFrame(SSH_AGENT_MESSAGE.FAILURE, Buffer.alloc(0)));
    const [identity] = describeIdentities([{ keyBlob: KEY_BLOB, comment: 'alice@laptop' }]);
    if (identity === undefined) throw new Error('unreachable');

    let addCalled = false;
    const api = {
      beginSshEnrollment: () =>
        Promise.resolve<BeginSshEnrollmentResponse>({
          challengeId: 'enroll-chal-2',
          nonce: Buffer.from([1, 1, 1, 1]),
          expiresAt: fromDate(new Date(Date.now() + 60_000)),
        }),
      addCredential: () => {
        addCalled = true;
        return Promise.reject(new Error('should not be called'));
      },
    };

    await expect(
      enrollSshCredential({
        api,
        accessToken: 'access-1',
        nodeDomain: 'patches.example',
        socketPath: agent.path,
        identity,
      }),
    ).rejects.toThrow(/refused to sign/);
    expect(addCalled).toBe(false);
  });
});
