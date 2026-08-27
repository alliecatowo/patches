/** Wire identifier. Any byte-level protocol change requires a new identifier/version. */
export const E2EE_PROTOCOL = 'patches-e2ee-v1' as const;
export const E2EE_VERSION = 1 as const;
export const E2EE_ALGORITHM = 'X25519+Ed25519+HKDF-SHA256+XChaCha20-Poly1305+DR-HE-r4' as const;

export const KEY_BYTES = 32;
export const SIGNATURE_BYTES = 64;
export const HEADER_NONCE_BYTES = 24;
/**
 * The ceiling on the skipped-message-key cache, and therefore the only skip bound the ratchet
 * enforces (2026-08 audit fix). Recovery semantics: a delivered message whose chain position is
 * ahead of the receive counter causes the receiver to derive and retain every missed key, and
 * refuses (`TooManySkippedMessagesError`, that one delivery attempt only, state untouched) when
 * the whole gap would not fit below this bound. Refusal never advances or wedges the chain — a
 * reply round-trip DH-ratchets past a stuck chain, whereas the retired per-gap cap (`MAX_SKIP`,
 * removed under ADR 0030's pre-production consolidation policy) threw before storing anything
 * and left every future message on the chain, and every DH ratchet off it, refusing forever.
 */
export const MAX_SKIPPED_KEYS = 2_000;

export interface KeyPair {
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
}

export interface DevicePrivateKeys {
  readonly signing: KeyPair;
  readonly agreement: KeyPair;
}

export interface OneTimePreKey {
  readonly id: number;
  readonly publicKey: Uint8Array;
}

export interface PrivatePreKey {
  readonly id: number;
  readonly keyPair: KeyPair;
}

/**
 * A device certificate exactly as it travels on the wire: the canonical T2 transcript bytes plus
 * the messaging root's signature over them. The X3DH transcript embeds this pair directly, so
 * neither side ever re-encodes a decoded certificate to reproduce what the other side signed.
 */
export interface HandshakeCertifiedDevice {
  readonly certificateBytes: Uint8Array;
  readonly rootSignature: Uint8Array;
}

export interface X3dhHandshake {
  readonly protocol: typeof E2EE_PROTOCOL;
  readonly version: typeof E2EE_VERSION;
  readonly algorithm: typeof E2EE_ALGORITHM;
  readonly initiator: HandshakeCertifiedDevice;
  readonly responder: HandshakeCertifiedDevice;
  readonly initiatorRosterDigest: Uint8Array;
  readonly responderRosterDigest: Uint8Array;
  readonly ephemeralPublicKey: Uint8Array;
  readonly signedPreKeyId: number;
  readonly signedPreKeyPublicKey: Uint8Array;
  readonly oneTimePreKeyId?: number;
  readonly oneTimePreKeyPublicKey?: Uint8Array;
  readonly initiatorSignature: Uint8Array;
}

export interface X3dhSecrets {
  readonly rootKey: Uint8Array;
  readonly initiatorHeaderKey: Uint8Array;
  readonly responderHeaderKey: Uint8Array;
}

export interface SkippedMessageKey {
  readonly headerKey: Uint8Array;
  readonly messageNumber: number;
  readonly messageKey: Uint8Array;
}

export interface DoubleRatchetState {
  readonly protocol: typeof E2EE_PROTOCOL;
  readonly version: typeof E2EE_VERSION;
  readonly rootKey: Uint8Array;
  readonly sendingRatchetKey: KeyPair;
  readonly receivingRatchetPublicKey: Uint8Array | undefined;
  readonly sendingChainKey: Uint8Array | undefined;
  readonly receivingChainKey: Uint8Array | undefined;
  readonly sendingHeaderKey: Uint8Array | undefined;
  readonly receivingHeaderKey: Uint8Array | undefined;
  readonly nextSendingHeaderKey: Uint8Array;
  readonly nextReceivingHeaderKey: Uint8Array;
  readonly sentCount: number;
  readonly receivedCount: number;
  readonly previousSendingChainLength: number;
  readonly skippedMessageKeys: ReadonlyMap<string, SkippedMessageKey>;
}

export interface EncryptedRatchetMessage {
  readonly encryptedHeader: Uint8Array;
  readonly ciphertext: Uint8Array;
}

export interface RatchetTransition<T> {
  readonly state: DoubleRatchetState;
  readonly output: T;
}

export interface RatchetRandomSource {
  randomBytes(length: number): Uint8Array;
  generateKeyAgreementKeyPair(): KeyPair;
}
