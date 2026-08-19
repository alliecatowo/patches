/** Wire identifier. Any byte-level protocol change requires a new identifier/version. */
export const E2EE_PROTOCOL = 'patches-e2ee-v1' as const;
export const E2EE_VERSION = 1 as const;
export const E2EE_ALGORITHM = 'X25519+Ed25519+HKDF-SHA256+XChaCha20-Poly1305+DR-HE-r4' as const;

export const KEY_BYTES = 32;
export const SIGNATURE_BYTES = 64;
export const HEADER_NONCE_BYTES = 24;
export const MAX_SKIP = 1_000;
export const MAX_SKIPPED_KEYS = 2_000;

export interface KeyPair {
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
}

export interface DevicePrivateKeys {
  readonly signing: KeyPair;
  readonly agreement: KeyPair;
}

export interface DeviceCertificate {
  readonly protocol: typeof E2EE_PROTOCOL;
  readonly version: typeof E2EE_VERSION;
  readonly userId: string;
  readonly deviceId: string;
  readonly signingPublicKey: Uint8Array;
  readonly agreementPublicKey: Uint8Array;
  readonly generation: number;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

export interface CertifiedDevice {
  readonly certificate: DeviceCertificate;
  readonly rootSignature: Uint8Array;
}

export interface DeviceRoster {
  readonly protocol: typeof E2EE_PROTOCOL;
  readonly version: typeof E2EE_VERSION;
  readonly userId: string;
  readonly rootPublicKey: Uint8Array;
  readonly sequence: number;
  readonly previousDigest: Uint8Array;
  readonly devices: readonly CertifiedDevice[];
  readonly createdAtMs: number;
}

export interface SignedDeviceRoster {
  readonly roster: DeviceRoster;
  readonly rootSignature: Uint8Array;
}

export interface SignedPreKey {
  readonly id: number;
  readonly publicKey: Uint8Array;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly signature: Uint8Array;
}

export interface OneTimePreKey {
  readonly id: number;
  readonly publicKey: Uint8Array;
}

export interface PrivatePreKey {
  readonly id: number;
  readonly keyPair: KeyPair;
}

export interface PreKeyBundle {
  readonly protocol: typeof E2EE_PROTOCOL;
  readonly version: typeof E2EE_VERSION;
  readonly certifiedDevice: CertifiedDevice;
  readonly rosterDigest: Uint8Array;
  readonly signedPreKey: SignedPreKey;
  readonly oneTimePreKey?: OneTimePreKey;
}

export interface X3dhHandshake {
  readonly protocol: typeof E2EE_PROTOCOL;
  readonly version: typeof E2EE_VERSION;
  readonly algorithm: typeof E2EE_ALGORITHM;
  readonly initiator: CertifiedDevice;
  readonly responder: CertifiedDevice;
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
