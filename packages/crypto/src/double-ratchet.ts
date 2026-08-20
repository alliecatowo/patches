import { ByteReader, ByteWriter, concatBytes, toHex } from './codec.js';
import {
  AuthenticationError,
  MalformedInputError,
  RatchetStateError,
  ReplayedMessageError,
  TooManySkippedMessagesError,
} from './errors.js';
import {
  aeadDecrypt,
  aeadEncrypt,
  generateKeyAgreementKeyPair,
  hkdfSha256,
  hmacSha256,
  keyAgreement,
  randomBytes,
  sha256Hash,
} from './primitives.js';
import {
  E2EE_PROTOCOL,
  E2EE_VERSION,
  HEADER_NONCE_BYTES,
  KEY_BYTES,
  MAX_SKIP,
  MAX_SKIPPED_KEYS,
  type DoubleRatchetState,
  type EncryptedRatchetMessage,
  type KeyPair,
  type RatchetRandomSource,
  type RatchetTransition,
  type SkippedMessageKey,
  type X3dhSecrets,
} from './types.js';
import { zeroize } from './zeroize.js';

/**
 * Versioned independently of `E2EE_VERSION`: this is the on-disk shape of a persisted ratchet
 * state, not the wire protocol. Bump it whenever a field is added, removed, or reordered so an
 * older vault entry is rejected instead of silently misparsed.
 */
const RATCHET_STATE_FORMAT_VERSION = 1;
const ROOT_KDF_CONTEXT = 'patches-e2ee-v1/double-ratchet/root-he-r4';
const MESSAGE_KDF_CONTEXT = 'patches-e2ee-v1/double-ratchet/message';
const HEADER_AEAD_CONTEXT = new TextEncoder().encode('patches-e2ee-v1/double-ratchet/header-he-r4');
const BODY_AEAD_CONTEXT = 'patches-e2ee-v1/double-ratchet/body-he-r4';
const ZERO_SALT = new Uint8Array(KEY_BYTES);
const HEADER_PLAINTEXT_BYTES = 1 + KEY_BYTES + 4 + 4;
const HEADER_CIPHERTEXT_BYTES = HEADER_NONCE_BYTES + HEADER_PLAINTEXT_BYTES + 16;

interface Header {
  readonly ratchetPublicKey: Uint8Array;
  readonly previousChainLength: number;
  readonly messageNumber: number;
}

interface MutableRatchetState {
  protocol: typeof E2EE_PROTOCOL;
  version: typeof E2EE_VERSION;
  rootKey: Uint8Array;
  sendingRatchetKey: KeyPair;
  receivingRatchetPublicKey: Uint8Array | undefined;
  sendingChainKey: Uint8Array | undefined;
  receivingChainKey: Uint8Array | undefined;
  sendingHeaderKey: Uint8Array | undefined;
  receivingHeaderKey: Uint8Array | undefined;
  nextSendingHeaderKey: Uint8Array;
  nextReceivingHeaderKey: Uint8Array;
  sentCount: number;
  receivedCount: number;
  previousSendingChainLength: number;
  skippedMessageKeys: Map<string, SkippedMessageKey>;
}

const defaultRandomSource: RatchetRandomSource = {
  randomBytes,
  generateKeyAgreementKeyPair,
};

function cloneKeyPair(value: KeyPair): KeyPair {
  return { publicKey: value.publicKey.slice(), privateKey: value.privateKey.slice() };
}

function cloneState(state: DoubleRatchetState): MutableRatchetState {
  const skipped = new Map<string, SkippedMessageKey>();
  for (const [key, value] of state.skippedMessageKeys) {
    skipped.set(key, {
      headerKey: value.headerKey.slice(),
      messageNumber: value.messageNumber,
      messageKey: value.messageKey.slice(),
    });
  }
  return {
    protocol: state.protocol,
    version: state.version,
    rootKey: state.rootKey.slice(),
    sendingRatchetKey: cloneKeyPair(state.sendingRatchetKey),
    receivingRatchetPublicKey: state.receivingRatchetPublicKey?.slice(),
    sendingChainKey: state.sendingChainKey?.slice(),
    receivingChainKey: state.receivingChainKey?.slice(),
    sendingHeaderKey: state.sendingHeaderKey?.slice(),
    receivingHeaderKey: state.receivingHeaderKey?.slice(),
    nextSendingHeaderKey: state.nextSendingHeaderKey.slice(),
    nextReceivingHeaderKey: state.nextReceivingHeaderKey.slice(),
    sentCount: state.sentCount,
    receivedCount: state.receivedCount,
    previousSendingChainLength: state.previousSendingChainLength,
    skippedMessageKeys: skipped,
  };
}

function freezeState(state: MutableRatchetState): DoubleRatchetState {
  return state;
}

function kdfChain(chainKey: Uint8Array): { chainKey: Uint8Array; messageKey: Uint8Array } {
  return {
    messageKey: hmacSha256(chainKey, Uint8Array.of(0x01)),
    chainKey: hmacSha256(chainKey, Uint8Array.of(0x02)),
  };
}

function kdfRoot(
  rootKey: Uint8Array,
  dhOutput: Uint8Array,
): { rootKey: Uint8Array; chainKey: Uint8Array; nextHeaderKey: Uint8Array } {
  const material = hkdfSha256(dhOutput, rootKey, ROOT_KDF_CONTEXT, 96);
  const result = {
    rootKey: material.slice(0, 32),
    chainKey: material.slice(32, 64),
    nextHeaderKey: material.slice(64, 96),
  };
  zeroize(material, dhOutput);
  return result;
}

function messageAeadMaterial(messageKey: Uint8Array): { key: Uint8Array; nonce: Uint8Array } {
  const material = hkdfSha256(messageKey, ZERO_SALT, MESSAGE_KDF_CONTEXT, 56);
  const result = { key: material.slice(0, 32), nonce: material.slice(32, 56) };
  zeroize(material);
  return result;
}

function encodeHeader(header: Header): Uint8Array {
  if (header.ratchetPublicKey.length !== KEY_BYTES) {
    throw new MalformedInputError('Ratchet public key has an invalid length.');
  }
  return new ByteWriter()
    .u8(E2EE_VERSION)
    .fixed(header.ratchetPublicKey, KEY_BYTES)
    .u32(header.previousChainLength)
    .u32(header.messageNumber)
    .finish();
}

function decodeHeader(value: Uint8Array): Header {
  const reader = new ByteReader(value);
  const version = reader.u8();
  const header = {
    ratchetPublicKey: reader.fixed(KEY_BYTES),
    previousChainLength: reader.u32(),
    messageNumber: reader.u32(),
  };
  reader.end();
  if (version !== E2EE_VERSION) throw new MalformedInputError('Unsupported ratchet header.');
  return header;
}

function encryptHeader(
  headerKey: Uint8Array,
  header: Header,
  source: RatchetRandomSource,
): Uint8Array {
  const nonce = source.randomBytes(HEADER_NONCE_BYTES);
  if (nonce.length !== HEADER_NONCE_BYTES) {
    throw new RatchetStateError('Header nonce source returned the wrong number of bytes.');
  }
  return concatBytes(
    nonce,
    aeadEncrypt(headerKey, nonce, encodeHeader(header), HEADER_AEAD_CONTEXT),
  );
}

function decryptHeader(
  headerKey: Uint8Array | undefined,
  encryptedHeader: Uint8Array,
): Header | undefined {
  if (headerKey === undefined || encryptedHeader.length !== HEADER_CIPHERTEXT_BYTES)
    return undefined;
  const nonce = encryptedHeader.slice(0, HEADER_NONCE_BYTES);
  const ciphertext = encryptedHeader.slice(HEADER_NONCE_BYTES);
  try {
    return decodeHeader(aeadDecrypt(headerKey, nonce, ciphertext, HEADER_AEAD_CONTEXT));
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof MalformedInputError)
      return undefined;
    throw error;
  }
}

function bodyAssociatedData(external: Uint8Array, encryptedHeader: Uint8Array): Uint8Array {
  return new ByteWriter().string(BODY_AEAD_CONTEXT).bytes(external).bytes(encryptedHeader).finish();
}

function skippedKeyId(headerKey: Uint8Array, messageNumber: number): string {
  return `${toHex(sha256Hash(headerKey))}:${String(messageNumber)}`;
}

function skipMessageKeys(state: MutableRatchetState, until: number): void {
  if (!Number.isInteger(until) || until < state.receivedCount) {
    throw new ReplayedMessageError('Message number was already processed.');
  }
  if (until - state.receivedCount > MAX_SKIP)
    throw new TooManySkippedMessagesError('Gap too large.');
  if (until === state.receivedCount) return;
  if (state.receivingChainKey === undefined || state.receivingHeaderKey === undefined) {
    throw new RatchetStateError('Receiving chain is not initialized.');
  }
  if (state.skippedMessageKeys.size + (until - state.receivedCount) > MAX_SKIPPED_KEYS) {
    throw new TooManySkippedMessagesError('Skipped-key cache is full.');
  }
  while (state.receivedCount < until) {
    const derived = kdfChain(state.receivingChainKey);
    zeroize(state.receivingChainKey);
    state.receivingChainKey = derived.chainKey;
    const record: SkippedMessageKey = {
      headerKey: state.receivingHeaderKey.slice(),
      messageNumber: state.receivedCount,
      messageKey: derived.messageKey,
    };
    state.skippedMessageKeys.set(skippedKeyId(record.headerKey, record.messageNumber), record);
    state.receivedCount += 1;
  }
}

function dhRatchet(state: MutableRatchetState, header: Header, source: RatchetRandomSource): void {
  state.previousSendingChainLength = state.sentCount;
  state.sentCount = 0;
  state.receivedCount = 0;
  state.sendingHeaderKey = state.nextSendingHeaderKey;
  state.receivingHeaderKey = state.nextReceivingHeaderKey;
  state.receivingRatchetPublicKey = header.ratchetPublicKey.slice();

  const receiving = kdfRoot(
    state.rootKey,
    keyAgreement(state.sendingRatchetKey.privateKey, header.ratchetPublicKey),
  );
  zeroize(state.rootKey, state.receivingChainKey);
  state.rootKey = receiving.rootKey;
  state.receivingChainKey = receiving.chainKey;
  state.nextReceivingHeaderKey = receiving.nextHeaderKey;

  const nextRatchetKey = source.generateKeyAgreementKeyPair();
  const sending = kdfRoot(
    state.rootKey,
    keyAgreement(nextRatchetKey.privateKey, header.ratchetPublicKey),
  );
  zeroize(
    state.rootKey,
    state.sendingChainKey,
    state.sendingRatchetKey.privateKey,
    state.sendingRatchetKey.publicKey,
  );
  state.rootKey = sending.rootKey;
  state.sendingChainKey = sending.chainKey;
  state.nextSendingHeaderKey = sending.nextHeaderKey;
  state.sendingRatchetKey = nextRatchetKey;
}

export function initializeInitiatorRatchet(
  secrets: X3dhSecrets,
  initiatorRatchetKey: KeyPair,
  responderRatchetPublicKey: Uint8Array,
): DoubleRatchetState {
  const initial = kdfRoot(
    secrets.rootKey.slice(),
    keyAgreement(initiatorRatchetKey.privateKey, responderRatchetPublicKey),
  );
  return {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    rootKey: initial.rootKey,
    sendingRatchetKey: cloneKeyPair(initiatorRatchetKey),
    receivingRatchetPublicKey: responderRatchetPublicKey.slice(),
    sendingChainKey: initial.chainKey,
    receivingChainKey: undefined,
    sendingHeaderKey: secrets.initiatorHeaderKey.slice(),
    receivingHeaderKey: undefined,
    nextSendingHeaderKey: initial.nextHeaderKey,
    nextReceivingHeaderKey: secrets.responderHeaderKey.slice(),
    sentCount: 0,
    receivedCount: 0,
    previousSendingChainLength: 0,
    skippedMessageKeys: new Map(),
  };
}

export function initializeResponderRatchet(
  secrets: X3dhSecrets,
  responderRatchetKey: KeyPair,
): DoubleRatchetState {
  return {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    rootKey: secrets.rootKey.slice(),
    sendingRatchetKey: cloneKeyPair(responderRatchetKey),
    receivingRatchetPublicKey: undefined,
    sendingChainKey: undefined,
    receivingChainKey: undefined,
    sendingHeaderKey: undefined,
    receivingHeaderKey: undefined,
    nextSendingHeaderKey: secrets.responderHeaderKey.slice(),
    nextReceivingHeaderKey: secrets.initiatorHeaderKey.slice(),
    sentCount: 0,
    receivedCount: 0,
    previousSendingChainLength: 0,
    skippedMessageKeys: new Map(),
  };
}

export function ratchetEncrypt(
  inputState: DoubleRatchetState,
  plaintext: Uint8Array,
  associatedData: Uint8Array,
  source: RatchetRandomSource = defaultRandomSource,
): RatchetTransition<EncryptedRatchetMessage> {
  const state = cloneState(inputState);
  if (state.sendingChainKey === undefined || state.sendingHeaderKey === undefined) {
    throw new RatchetStateError('Cannot send before the receiving side initializes the ratchet.');
  }
  if (state.sentCount >= 0xffff_ffff) throw new RatchetStateError('Sending counter exhausted.');
  const derived = kdfChain(state.sendingChainKey);
  const header: Header = {
    ratchetPublicKey: state.sendingRatchetKey.publicKey,
    previousChainLength: state.previousSendingChainLength,
    messageNumber: state.sentCount,
  };
  const encryptedHeader = encryptHeader(state.sendingHeaderKey, header, source);
  const material = messageAeadMaterial(derived.messageKey);
  const ciphertext = aeadEncrypt(
    material.key,
    material.nonce,
    plaintext,
    bodyAssociatedData(associatedData, encryptedHeader),
  );
  zeroize(state.sendingChainKey, derived.messageKey, material.key, material.nonce);
  state.sendingChainKey = derived.chainKey;
  state.sentCount += 1;
  return { state: freezeState(state), output: { encryptedHeader, ciphertext } };
}

function trySkippedMessage(
  state: MutableRatchetState,
  message: EncryptedRatchetMessage,
  associatedData: Uint8Array,
): Uint8Array | undefined {
  for (const [id, skipped] of state.skippedMessageKeys) {
    const header = decryptHeader(skipped.headerKey, message.encryptedHeader);
    if (header === undefined || header.messageNumber !== skipped.messageNumber) continue;
    const material = messageAeadMaterial(skipped.messageKey);
    const plaintext = aeadDecrypt(
      material.key,
      material.nonce,
      message.ciphertext,
      bodyAssociatedData(associatedData, message.encryptedHeader),
    );
    state.skippedMessageKeys.delete(id);
    zeroize(skipped.headerKey, skipped.messageKey, material.key, material.nonce);
    return plaintext;
  }
  return undefined;
}

export function ratchetDecrypt(
  inputState: DoubleRatchetState,
  message: EncryptedRatchetMessage,
  associatedData: Uint8Array,
  source: RatchetRandomSource = defaultRandomSource,
): RatchetTransition<Uint8Array> {
  const state = cloneState(inputState);
  const skippedPlaintext = trySkippedMessage(state, message, associatedData);
  if (skippedPlaintext !== undefined) {
    return { state: freezeState(state), output: skippedPlaintext };
  }

  let header = decryptHeader(state.receivingHeaderKey, message.encryptedHeader);
  let needsDhRatchet = false;
  if (header === undefined) {
    header = decryptHeader(state.nextReceivingHeaderKey, message.encryptedHeader);
    needsDhRatchet = header !== undefined;
  }
  if (header === undefined) throw new AuthenticationError();
  if (needsDhRatchet) {
    skipMessageKeys(state, header.previousChainLength);
    dhRatchet(state, header, source);
  }
  if (header.messageNumber < state.receivedCount) {
    throw new ReplayedMessageError('Message number was already processed.');
  }
  skipMessageKeys(state, header.messageNumber);
  if (state.receivingChainKey === undefined) {
    throw new RatchetStateError('Receiving chain is not initialized.');
  }
  const derived = kdfChain(state.receivingChainKey);
  const material = messageAeadMaterial(derived.messageKey);
  const plaintext = aeadDecrypt(
    material.key,
    material.nonce,
    message.ciphertext,
    bodyAssociatedData(associatedData, message.encryptedHeader),
  );
  zeroize(state.receivingChainKey, derived.messageKey, material.key, material.nonce);
  state.receivingChainKey = derived.chainKey;
  state.receivedCount += 1;
  return { state: freezeState(state), output: plaintext };
}

/** Best-effort JS zeroization after a newer state has been durably committed. */
export function disposeRatchetState(state: DoubleRatchetState): void {
  zeroize(
    state.rootKey,
    state.sendingRatchetKey.privateKey,
    state.sendingRatchetKey.publicKey,
    state.receivingRatchetPublicKey,
    state.sendingChainKey,
    state.receivingChainKey,
    state.sendingHeaderKey,
    state.receivingHeaderKey,
    state.nextSendingHeaderKey,
    state.nextReceivingHeaderKey,
  );
  for (const skipped of state.skippedMessageKeys.values()) {
    zeroize(skipped.headerKey, skipped.messageKey);
  }
}

function writeOptionalKey(writer: ByteWriter, value: Uint8Array | undefined): ByteWriter {
  writer.u8(value === undefined ? 0 : 1);
  return value === undefined ? writer : writer.fixed(value, KEY_BYTES);
}

function readOptionalKey(reader: ByteReader): Uint8Array | undefined {
  const present = reader.u8();
  if (present === 0) return undefined;
  if (present !== 1) throw new MalformedInputError('Optional key presence flag is invalid.');
  return reader.fixed(KEY_BYTES);
}

/**
 * Explicit, versioned byte encoding of a Double Ratchet session for an encrypted client vault.
 * Never call `JSON.stringify`/log a `DoubleRatchetState` directly — its sequence counters and
 * key material must only leave memory through this opaque, vault-bound byte form.
 */
export function encodeRatchetState(state: DoubleRatchetState): Uint8Array {
  if (state.protocol !== E2EE_PROTOCOL || state.version !== E2EE_VERSION) {
    throw new RatchetStateError('Unsupported ratchet state protocol or version.');
  }
  const writer = new ByteWriter()
    .u8(RATCHET_STATE_FORMAT_VERSION)
    .fixed(state.rootKey, KEY_BYTES)
    .fixed(state.sendingRatchetKey.publicKey, KEY_BYTES)
    .fixed(state.sendingRatchetKey.privateKey, KEY_BYTES);
  writeOptionalKey(writer, state.receivingRatchetPublicKey);
  writeOptionalKey(writer, state.sendingChainKey);
  writeOptionalKey(writer, state.receivingChainKey);
  writeOptionalKey(writer, state.sendingHeaderKey);
  writeOptionalKey(writer, state.receivingHeaderKey);
  writer
    .fixed(state.nextSendingHeaderKey, KEY_BYTES)
    .fixed(state.nextReceivingHeaderKey, KEY_BYTES)
    .u32(state.sentCount)
    .u32(state.receivedCount)
    .u32(state.previousSendingChainLength)
    .u32(state.skippedMessageKeys.size);
  for (const skipped of state.skippedMessageKeys.values()) {
    writer
      .fixed(skipped.headerKey, KEY_BYTES)
      .u32(skipped.messageNumber)
      .fixed(skipped.messageKey, KEY_BYTES);
  }
  return writer.finish();
}

/**
 * Inverse of {@link encodeRatchetState}. Rejects an unknown format version, a truncated or
 * over-long buffer, and a skipped-key count above `MAX_SKIPPED_KEYS` before allocating anything
 * proportional to an attacker-controlled count, so a corrupted vault entry fails closed.
 */
export function decodeRatchetState(bytes: Uint8Array): DoubleRatchetState {
  const reader = new ByteReader(bytes);
  const formatVersion = reader.u8();
  if (formatVersion !== RATCHET_STATE_FORMAT_VERSION) {
    throw new RatchetStateError('Unsupported ratchet state format version.');
  }
  const rootKey = reader.fixed(KEY_BYTES);
  const sendingRatchetKey: KeyPair = {
    publicKey: reader.fixed(KEY_BYTES),
    privateKey: reader.fixed(KEY_BYTES),
  };
  const receivingRatchetPublicKey = readOptionalKey(reader);
  const sendingChainKey = readOptionalKey(reader);
  const receivingChainKey = readOptionalKey(reader);
  const sendingHeaderKey = readOptionalKey(reader);
  const receivingHeaderKey = readOptionalKey(reader);
  const nextSendingHeaderKey = reader.fixed(KEY_BYTES);
  const nextReceivingHeaderKey = reader.fixed(KEY_BYTES);
  const sentCount = reader.u32();
  const receivedCount = reader.u32();
  const previousSendingChainLength = reader.u32();
  const skippedCount = reader.u32();
  if (skippedCount > MAX_SKIPPED_KEYS) {
    throw new TooManySkippedMessagesError('Serialized skipped-key count exceeds the bound.');
  }
  const skippedMessageKeys = new Map<string, SkippedMessageKey>();
  for (let index = 0; index < skippedCount; index += 1) {
    const headerKey = reader.fixed(KEY_BYTES);
    const messageNumber = reader.u32();
    const messageKey = reader.fixed(KEY_BYTES);
    skippedMessageKeys.set(skippedKeyId(headerKey, messageNumber), {
      headerKey,
      messageNumber,
      messageKey,
    });
  }
  reader.end();
  return {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    rootKey,
    sendingRatchetKey,
    receivingRatchetPublicKey,
    sendingChainKey,
    receivingChainKey,
    sendingHeaderKey,
    receivingHeaderKey,
    nextSendingHeaderKey,
    nextReceivingHeaderKey,
    sentCount,
    receivedCount,
    previousSendingChainLength,
    skippedMessageKeys,
  };
}
