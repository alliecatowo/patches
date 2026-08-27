/**
 * Framing for the initial-envelope setup block (ADR 0020 §5, §8; ADR 0034 Stage 0(a)). This is
 * the one thing in the client E2EE runtime that two *clients* must agree on byte-for-byte with no
 * server in the middle — the `apps/tui` and `apps/web` copies of `session-setup.ts` each declared
 * it independently, so it is hoisted here (before the rest of that runtime, ADR 0034 §Stage 2) and
 * pinned by `src/vectors/setup-block.json`.
 *
 * The concrete framing is a four-byte magic (`SETUP_MAGIC`, "PESH") plus a big-endian u32 length
 * prefix, prepended to the ordinary encrypted ratchet header, wrapping a length-implied setup
 * block: version byte, sender identity, roster digests, ephemeral key, signed-prekey id (u64,
 * ADR 0033 §2) and key, a one-time-prekey presence flag plus optional one-time-prekey id (u64) and
 * key, then the initiator's transcript signature. Every later message on the same session stays a
 * bare ratchet header, so a receiver can tell the two apart deterministically.
 *
 * This module only frames bytes — it has no opinion on what a decode failure means to a caller.
 * `decodeSetupBlock`/`splitInitialHeader` throw `MalformedInputError`; callers with a richer error
 * vocabulary (`E2eeContractError` and friends) translate it, the same pattern `vault-format.ts`
 * uses for the sealed vault container.
 */
import { ByteReader, ByteWriter, concatBytes } from './codec.js';
import { MalformedInputError } from './errors.js';
import { E2EE_ALGORITHM, E2EE_PROTOCOL, E2EE_VERSION, type X3dhHandshake } from './types.js';

export const SETUP_MAGIC = new Uint8Array([0x50, 0x45, 0x53, 0x48]); // "PESH"
export const SETUP_VERSION = 1;

/** The setup block an initial envelope carries alongside its ratchet header. */
export interface InitialSetupBlock {
  readonly senderActorId: string;
  readonly senderDeviceId: string;
  readonly handshake: Omit<X3dhHandshake, 'initiator' | 'responder'>;
}

export function encodeSetupBlock(
  identity: { readonly actorId: string; readonly deviceId: string },
  handshake: X3dhHandshake,
): Uint8Array {
  const hasOneTime = handshake.oneTimePreKeyId !== undefined;
  const writer = new ByteWriter()
    .u8(SETUP_VERSION)
    .string(identity.actorId)
    .string(identity.deviceId)
    .fixed(handshake.initiatorRosterDigest, 32)
    .fixed(handshake.responderRosterDigest, 32)
    .fixed(handshake.ephemeralPublicKey, 32)
    .u64(handshake.signedPreKeyId)
    .fixed(handshake.signedPreKeyPublicKey, 32)
    .u8(hasOneTime ? 1 : 0);
  if (hasOneTime && handshake.oneTimePreKeyPublicKey !== undefined) {
    writer.u64(handshake.oneTimePreKeyId ?? 0).fixed(handshake.oneTimePreKeyPublicKey, 32);
  }
  return writer.fixed(handshake.initiatorSignature, 64).finish();
}

export function decodeSetupBlock(bytes: Uint8Array): InitialSetupBlock {
  const reader = new ByteReader(bytes);
  const version = reader.u8();
  if (version !== SETUP_VERSION) {
    throw new MalformedInputError('Unsupported setup-header version.');
  }
  const senderActorId = reader.string();
  const senderDeviceId = reader.string();
  const base = {
    initiatorRosterDigest: reader.fixed(32),
    responderRosterDigest: reader.fixed(32),
    ephemeralPublicKey: reader.fixed(32),
    signedPreKeyId: reader.u64(),
    signedPreKeyPublicKey: reader.fixed(32),
  };
  const hasOneTime = reader.u8() === 1;
  const oneTime = hasOneTime
    ? { oneTimePreKeyId: reader.u64(), oneTimePreKeyPublicKey: reader.fixed(32) }
    : {};
  const initiatorSignature = reader.fixed(64);
  reader.end();
  return {
    senderActorId,
    senderDeviceId,
    handshake: {
      protocol: E2EE_PROTOCOL,
      version: E2EE_VERSION,
      algorithm: E2EE_ALGORITHM,
      ...base,
      ...oneTime,
      initiatorSignature,
    },
  };
}

export function isInitialEnvelopeHeader(headerBytes: Uint8Array): boolean {
  return (
    headerBytes.length >= SETUP_MAGIC.length &&
    SETUP_MAGIC.every((byte, index) => headerBytes[index] === byte)
  );
}

/** Prepends the magic and length prefix that marks an envelope header as carrying a setup block. */
export function encodeInitialFraming(setupBlock: Uint8Array): Uint8Array {
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, setupBlock.length, false);
  return concatBytes(SETUP_MAGIC, length, setupBlock);
}

/**
 * Splits an initial envelope's `encrypted_header` into the setup block and the header-encrypted
 * ratchet header it wraps. Rejects anything truncated or misframed.
 */
export function splitInitialHeader(headerBytes: Uint8Array): {
  readonly setup: InitialSetupBlock;
  readonly ratchetHeader: Uint8Array;
} {
  if (!isInitialEnvelopeHeader(headerBytes)) {
    throw new MalformedInputError('Initial header is missing its framing.');
  }
  const reader = new ByteReader(headerBytes.subarray(SETUP_MAGIC.length));
  const setupLength = reader.u32();
  const rest = headerBytes.subarray(SETUP_MAGIC.length + 4);
  if (setupLength > rest.length) throw new MalformedInputError('Initial header is truncated.');
  return {
    setup: decodeSetupBlock(rest.subarray(0, setupLength)),
    ratchetHeader: rest.slice(setupLength),
  };
}
