import { connect as netConnect, type Socket } from 'node:net';

/**
 * A minimal client for the SSH agent wire protocol, RFC 9987
 * (https://www.rfc-editor.org/rfc/rfc9987.html, verified 2026-08-17 —
 * `docs/architecture/auth.md` §4). Only the two message pairs Patches needs are
 * implemented: listing loaded identities, and asking the agent to sign an
 * arbitrary blob it does not interpret (§5.6, §8.1).
 *
 * Patches never reads, requests, or transmits a private key — signing happens
 * entirely inside the agent process on the far end of `SSH_AUTH_SOCK`.
 */

export const SSH_AGENT_MESSAGE = {
  FAILURE: 5,
  SUCCESS: 6,
  REQUEST_IDENTITIES: 11,
  IDENTITIES_ANSWER: 12,
  SIGN_REQUEST: 13,
  SIGN_RESPONSE: 14,
} as const;

/** RFC 9987 §8.3 — requests an `rsa-sha2-512` signature from an `ssh-rsa` key. */
export const SSH_AGENT_RSA_SHA2_512 = 0x04;

export interface SshIdentity {
  /** The SSH wire-format public key blob (not OpenSSH `.pub` text). */
  keyBlob: Buffer;
  comment: string;
}

export interface SshSignature {
  /** e.g. `ssh-ed25519`, `rsa-sha2-512` — never `ssh-rsa` (spec: SHA-1 is rejected). */
  format: string;
  /** Raw signature bytes, without the format string (that travels separately). */
  blob: Buffer;
}

/** Read `SSH_AUTH_SOCK` from the environment; `undefined` when no agent is configured. */
export function sshAuthSock(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.SSH_AUTH_SOCK;
  return value !== undefined && value.trim() !== '' ? value : undefined;
}

// ---------------------------------------------------------------------------
// Wire framing: `uint32` big-endian length prefix, then `byte message-type`,
// then a type-specific payload (RFC 9987 §4). Every string/blob field inside a
// payload is itself `uint32` length + bytes — the same discipline RFC 4252 §7
// uses for its own signed blobs, which is why `ssh-login.ts` reuses these
// helpers to build the Patches login challenge blob.
// ---------------------------------------------------------------------------

export function encodeFrame(messageType: number, payload: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from([messageType]), payload]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, body]);
}

export function encodeString(value: Buffer | string): Buffer {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length, 0);
  return Buffer.concat([length, bytes]);
}

export function encodeUint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

/** Reads sequential `uint32`/length-prefixed-string fields out of one payload. */
export class SshWireReader {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  readUint32(): number {
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  readString(): Buffer {
    const length = this.readUint32();
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  get remaining(): number {
    return this.buffer.length - this.offset;
  }
}

/** Accumulates socket bytes and yields complete length-prefixed frames. */
export class SshFrameReader {
  private buffered = Buffer.alloc(0);

  push(chunk: Buffer): Buffer[] {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    const frames: Buffer[] = [];
    for (;;) {
      if (this.buffered.length < 4) break;
      const length = this.buffered.readUInt32BE(0);
      if (this.buffered.length < 4 + length) break;
      frames.push(this.buffered.subarray(4, 4 + length));
      this.buffered = this.buffered.subarray(4 + length);
    }
    return frames;
  }
}

/** The algorithm name is the first field of any SSH wire-format key blob. */
export function sshAlgorithmFromBlob(blob: Buffer): string {
  return new SshWireReader(blob).readString().toString('utf8');
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function connectSocket(path: string, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect(path);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to the SSH agent at ${path}`));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * Opens one connection to `socketPath`, sends exactly one framed request, waits
 * for exactly one framed reply, then closes. Every Patches call to the agent is
 * this simple request/response shape, so there is no need for a long-lived
 * client with a request-id/pending-map beyond a single in-flight call.
 */
async function requestOnce(
  socketPath: string,
  timeoutMs: number,
  messageType: number,
  payload: Buffer,
): Promise<Buffer> {
  const socket = await connectSocket(socketPath, timeoutMs);
  const reader = new SshFrameReader();

  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for the SSH agent to reply.'));
      }, timeoutMs);

      socket.on('data', (chunk: Buffer) => {
        const [frame] = reader.push(chunk);
        if (frame !== undefined) {
          clearTimeout(timer);
          resolve(frame);
        }
      });
      socket.on('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on('close', () => {
        clearTimeout(timer);
        reject(new Error('The SSH agent closed the connection before replying.'));
      });

      socket.write(encodeFrame(messageType, payload));
    });
  } finally {
    socket.destroy();
  }
}

export async function listIdentities(socketPath: string, timeoutMs = 5000): Promise<SshIdentity[]> {
  const reply = await requestOnce(
    socketPath,
    timeoutMs,
    SSH_AGENT_MESSAGE.REQUEST_IDENTITIES,
    Buffer.alloc(0),
  );
  const type = reply[0];
  if (type !== SSH_AGENT_MESSAGE.IDENTITIES_ANSWER) {
    throw new Error(`SSH agent replied with unexpected message type ${String(type)}.`);
  }

  const reader = new SshWireReader(reply.subarray(1));
  const count = reader.readUint32();
  const identities: SshIdentity[] = [];
  for (let index = 0; index < count; index += 1) {
    const keyBlob = Buffer.from(reader.readString());
    const comment = reader.readString().toString('utf8');
    identities.push({ keyBlob, comment });
  }
  return identities;
}

/**
 * Asks the agent to sign `data` with the identity matching `keyBlob`.
 *
 * `flags` selects the signature format for `ssh-rsa` keys ({@link
 * SSH_AGENT_RSA_SHA2_512}); pass `0` for `ssh-ed25519` and other keys with no
 * signature-format ambiguity.
 */
export async function signWithAgent(
  socketPath: string,
  keyBlob: Buffer,
  data: Buffer,
  flags: number,
  timeoutMs = 5000,
): Promise<SshSignature> {
  const payload = Buffer.concat([encodeString(keyBlob), encodeString(data), encodeUint32(flags)]);
  const reply = await requestOnce(socketPath, timeoutMs, SSH_AGENT_MESSAGE.SIGN_REQUEST, payload);
  const type = reply[0];

  if (type === SSH_AGENT_MESSAGE.FAILURE) {
    throw new Error('The SSH agent refused to sign (key not loaded, or declined).');
  }
  if (type !== SSH_AGENT_MESSAGE.SIGN_RESPONSE) {
    throw new Error(`SSH agent replied with unexpected message type ${String(type)}.`);
  }

  const outer = new SshWireReader(reply.subarray(1));
  const signatureBlob = Buffer.from(outer.readString());
  const inner = new SshWireReader(signatureBlob);
  const format = inner.readString().toString('utf8');
  const blob = Buffer.from(inner.readString());
  return { format, blob };
}
