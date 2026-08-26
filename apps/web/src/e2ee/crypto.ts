/**
 * Browser crypto barrel for the web E2EE runtime (B-102's open follow-up).
 *
 * Everything here is re-exported from `@patches/crypto`, whose only dependencies are
 * `@noble/ciphers`, `@noble/curves`, and `@noble/hashes` — all pure TypeScript with
 * browser-grade entropy (`randomBytes` from `@noble/ciphers/utils` uses the platform's
 * `crypto.getRandomValues`; Ed25519/X25519 from `@noble/curves/ed25519` never touch
 * `node:*`). `apps/web`'s Vite build bundles this barrel with no Node-specific import
 * leaking through — asserted by `pnpm --filter @patches/web build` (tsc + vite build)
 * and by this package's own bundle probe test.
 *
 * Hard rule (ADR 0020 §4 / spec §194, unchanged from the TUI barrel): no key material,
 * ratchet counters, or message content ever reaches a log or error line.
 */
export {
  ByteReader,
  ByteWriter,
  concatBytes,
  KEY_BYTES,
  MalformedInputError,
  randomBytes,
  sha256Hash,
  zeroize,
} from '@patches/crypto';

export {
  certifyDevice,
  createSignedPreKey,
  generateKeyAgreementKeyPair,
  generateSigningKeyPair,
  rosterDigest,
  sign,
  signDeviceRoster,
  E2EE_PROTOCOL,
  E2EE_VERSION,
} from '@patches/crypto';

export {
  commitFranking,
  createFrankingOpeningKey,
  sealDeviceEnvelope,
  openDeviceEnvelope,
  ReplayedMessageError,
  disposeRatchetState,
  encodeRatchetState,
  decodeRatchetState,
} from '@patches/crypto';

export { aeadEncrypt, aeadDecrypt, hkdfSha256 } from '@patches/crypto';

export type {
  CertifiedDevice,
  DeviceCertificate,
  DevicePrivateKeys,
  DeviceRoster,
  DoubleRatchetState,
  KeyPair,
  PreKeyBundle,
  RatchetTransition,
  SignedDeviceRoster,
  X3dhHandshake,
} from '@patches/crypto';
