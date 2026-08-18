import { createServer, type Server, type Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  encodeFrame,
  encodeString,
  encodeUint32,
  listIdentities,
  SSH_AGENT_MESSAGE,
  SshFrameReader,
  sshAlgorithmFromBlob,
  sshAuthSock,
  signWithAgent,
  SshWireReader,
} from './ssh-agent.js';

/**
 * A tiny stand-in ssh-agent: a real Unix domain socket server that speaks just
 * enough of RFC 9987's framing to answer one request the way a real agent
 * would. `handle` receives the parsed (messageType, payload) of each request
 * frame and returns the raw reply frame bytes.
 */
function startFakeAgent(handle: (messageType: number, payload: Buffer) => Buffer): {
  path: string;
  server: Server;
  stop: () => Promise<void>;
} {
  const socketPath = join(
    tmpdir(),
    `patches-fake-agent-${String(process.pid)}-${String(Math.random()).slice(2)}.sock`,
  );
  const server = createServer((socket: Socket) => {
    const reader = new SshFrameReader();
    socket.on('data', (chunk: Buffer) => {
      for (const frame of reader.push(chunk)) {
        const messageType = frame[0] ?? -1;
        const reply = handle(messageType, frame.subarray(1));
        socket.write(reply);
      }
    });
  });
  server.listen(socketPath);
  return {
    path: socketPath,
    server,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

describe('sshAuthSock', () => {
  it('reads SSH_AUTH_SOCK from the given environment', () => {
    expect(sshAuthSock({ SSH_AUTH_SOCK: '/tmp/agent.sock' })).toBe('/tmp/agent.sock');
  });

  it('treats an unset or blank value as no agent configured', () => {
    expect(sshAuthSock({})).toBeUndefined();
    expect(sshAuthSock({ SSH_AUTH_SOCK: '   ' })).toBeUndefined();
  });
});

describe('wire framing helpers', () => {
  it('round-trips uint32 and string fields through SshWireReader', () => {
    const payload = Buffer.concat([
      encodeUint32(2),
      encodeString('ssh-ed25519'),
      encodeString(Buffer.from([1, 2, 3])),
    ]);
    const reader = new SshWireReader(payload);
    expect(reader.readUint32()).toBe(2);
    expect(reader.readString().toString('utf8')).toBe('ssh-ed25519');
    expect([...reader.readString()]).toEqual([1, 2, 3]);
    expect(reader.remaining).toBe(0);
  });

  it('reassembles frames split across multiple socket chunks', () => {
    const frame = encodeFrame(SSH_AGENT_MESSAGE.REQUEST_IDENTITIES, Buffer.from('hello'));
    const reader = new SshFrameReader();
    const first = reader.push(frame.subarray(0, 3));
    expect(first).toEqual([]);
    const second = reader.push(frame.subarray(3));
    expect(second).toHaveLength(1);
    expect(second[0]?.toString('utf8')).toBe(
      `${String.fromCharCode(SSH_AGENT_MESSAGE.REQUEST_IDENTITIES)}hello`,
    );
  });

  it('parses two frames delivered back to back in one chunk', () => {
    const frames = Buffer.concat([
      encodeFrame(SSH_AGENT_MESSAGE.SUCCESS, Buffer.alloc(0)),
      encodeFrame(SSH_AGENT_MESSAGE.FAILURE, Buffer.alloc(0)),
    ]);
    const reader = new SshFrameReader();
    const parsed = reader.push(frames);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.[0]).toBe(SSH_AGENT_MESSAGE.SUCCESS);
    expect(parsed[1]?.[0]).toBe(SSH_AGENT_MESSAGE.FAILURE);
  });

  it('reads the algorithm name out of an SSH wire-format key blob', () => {
    const blob = Buffer.concat([encodeString('ssh-ed25519'), Buffer.from([9, 9, 9])]);
    expect(sshAlgorithmFromBlob(blob)).toBe('ssh-ed25519');
  });
});

describe('listIdentities / signWithAgent against a fake agent socket', () => {
  let agent: ReturnType<typeof startFakeAgent> | undefined;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'patches-ssh-agent-'));
  });

  afterEach(async () => {
    await agent?.stop();
    agent = undefined;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('lists identities returned by SSH_AGENT_IDENTITIES_ANSWER', async () => {
    const keyBlob = Buffer.concat([encodeString('ssh-ed25519'), Buffer.from([1, 2, 3, 4])]);
    agent = startFakeAgent((messageType) => {
      expect(messageType).toBe(SSH_AGENT_MESSAGE.REQUEST_IDENTITIES);
      const payload = Buffer.concat([
        encodeUint32(1),
        encodeString(keyBlob),
        encodeString('alice@laptop'),
      ]);
      return encodeFrame(SSH_AGENT_MESSAGE.IDENTITIES_ANSWER, payload);
    });

    const identities = await listIdentities(agent.path);
    expect(identities).toHaveLength(1);
    expect(identities[0]?.comment).toBe('alice@laptop');
    expect(identities[0]?.keyBlob.equals(keyBlob)).toBe(true);
  });

  it('returns an empty list when the agent has no loaded identities', async () => {
    agent = startFakeAgent(() => encodeFrame(SSH_AGENT_MESSAGE.IDENTITIES_ANSWER, encodeUint32(0)));
    await expect(listIdentities(agent.path)).resolves.toEqual([]);
  });

  it('signs data via SSH_AGENTC_SIGN_REQUEST / SSH_AGENT_SIGN_RESPONSE', async () => {
    const keyBlob = Buffer.concat([encodeString('ssh-ed25519'), Buffer.from([5, 6])]);
    const data = Buffer.from('the challenge blob');
    let seenPayload: Buffer | undefined;

    agent = startFakeAgent((messageType, payload) => {
      expect(messageType).toBe(SSH_AGENT_MESSAGE.SIGN_REQUEST);
      seenPayload = payload;
      const signatureBlob = Buffer.concat([
        encodeString('ssh-ed25519'),
        encodeString(Buffer.from('sig-bytes')),
      ]);
      return encodeFrame(SSH_AGENT_MESSAGE.SIGN_RESPONSE, encodeString(signatureBlob));
    });

    const signature = await signWithAgent(agent.path, keyBlob, data, 0);
    expect(signature.format).toBe('ssh-ed25519');
    expect(signature.blob.toString('utf8')).toBe('sig-bytes');

    // The agent must receive exactly key blob + data + flags, in that order (RFC 9987 §5.6).
    const reader = new SshWireReader(seenPayload ?? Buffer.alloc(0));
    expect(reader.readString().equals(keyBlob)).toBe(true);
    expect(reader.readString().equals(data)).toBe(true);
    expect(reader.readUint32()).toBe(0);
  });

  it('passes the rsa-sha2-512 flag through unchanged', async () => {
    let seenFlags: number | undefined;
    agent = startFakeAgent((_type, payload) => {
      const reader = new SshWireReader(payload);
      reader.readString();
      reader.readString();
      seenFlags = reader.readUint32();
      const signatureBlob = Buffer.concat([
        encodeString('rsa-sha2-512'),
        encodeString(Buffer.from('sig')),
      ]);
      return encodeFrame(SSH_AGENT_MESSAGE.SIGN_RESPONSE, encodeString(signatureBlob));
    });

    await signWithAgent(agent.path, Buffer.from('key'), Buffer.from('data'), 0x04);
    expect(seenFlags).toBe(0x04);
  });

  it('rejects when the agent replies with SSH_AGENT_FAILURE', async () => {
    agent = startFakeAgent(() => encodeFrame(SSH_AGENT_MESSAGE.FAILURE, Buffer.alloc(0)));
    await expect(
      signWithAgent(agent.path, Buffer.from('key'), Buffer.from('data'), 0),
    ).rejects.toThrow(/refused to sign/);
  });

  it('rejects when nothing is listening on the socket path', async () => {
    await expect(listIdentities(join(tmpDir, 'no-such-agent.sock'), 200)).rejects.toThrow();
  });
});
