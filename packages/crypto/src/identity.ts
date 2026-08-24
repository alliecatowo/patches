import { ByteWriter, bytesEqual } from './codec.js';
import { CertificateError, PreKeyError, RosterRollbackError } from './errors.js';
import { sha256Hash, sign, verifyStrict } from './primitives.js';
import {
  E2EE_ALGORITHM,
  E2EE_PROTOCOL,
  E2EE_VERSION,
  KEY_BYTES,
  SIGNATURE_BYTES,
  type CertifiedDevice,
  type DeviceCertificate,
  type DeviceRoster,
  type KeyPair,
  type PreKeyBundle,
  type SignedDeviceRoster,
  type SignedPreKey,
} from './types.js';

/**
 * Client-side identity transcript domains. Exported for one reason: the node's own
 * certificate/roster transcript encoder (`apps/server` `e2ee.codec.ts`) signs over structurally
 * similar material, and the audit found both encoders using these exact strings — two encoders,
 * same domain separators, so a signature could verify across trust contexts up to the field-size
 * caps. These are exported so that disjointness is asserted by a test in the server package
 * instead of resting on two copies of two literals staying different by luck.
 */
export const CERTIFICATE_CONTEXT = 'patches-e2ee-v1/device-certificate';
export const ROSTER_CONTEXT = 'patches-e2ee-v1/device-roster';
const PREKEY_CONTEXT = 'patches-e2ee-v1/signed-prekey';
const SAFETY_NUMBER_CONTEXT = 'patches-e2ee-v1/safety-number';
const ZERO_DIGEST = new Uint8Array(32);

function requireKey(value: Uint8Array, label: string): void {
  if (value.length !== KEY_BYTES) throw new CertificateError(`${label} has an invalid length.`);
}

function requireSignature(value: Uint8Array, label: string): void {
  if (value.length !== SIGNATURE_BYTES) {
    throw new CertificateError(`${label} has an invalid length.`);
  }
}

function requireIdentity(value: string, label: string): void {
  if (value.length === 0 || value.length > 256) throw new CertificateError(`${label} is invalid.`);
}

function compareDevices(left: CertifiedDevice, right: CertifiedDevice): number {
  const idOrder = left.certificate.deviceId.localeCompare(right.certificate.deviceId, 'en');
  return idOrder === 0 ? left.certificate.generation - right.certificate.generation : idOrder;
}

export function encodeDeviceCertificate(certificate: DeviceCertificate): Uint8Array {
  requireIdentity(certificate.userId, 'User id');
  requireIdentity(certificate.deviceId, 'Device id');
  requireKey(certificate.signingPublicKey, 'Signing public key');
  requireKey(certificate.agreementPublicKey, 'Agreement public key');
  if (certificate.protocol !== E2EE_PROTOCOL || certificate.version !== E2EE_VERSION) {
    throw new CertificateError('Unsupported certificate protocol.');
  }
  if (certificate.generation < 1 || !Number.isSafeInteger(certificate.generation)) {
    throw new CertificateError('Device generation is invalid.');
  }
  if (
    !Number.isSafeInteger(certificate.createdAtMs) ||
    !Number.isSafeInteger(certificate.expiresAtMs) ||
    certificate.createdAtMs < 0 ||
    certificate.expiresAtMs <= certificate.createdAtMs
  ) {
    throw new CertificateError('Certificate validity interval is invalid.');
  }
  return new ByteWriter()
    .string(CERTIFICATE_CONTEXT)
    .string(certificate.protocol)
    .u8(certificate.version)
    .string(E2EE_ALGORITHM)
    .string(certificate.userId)
    .string(certificate.deviceId)
    .fixed(certificate.signingPublicKey, KEY_BYTES)
    .fixed(certificate.agreementPublicKey, KEY_BYTES)
    .u32(certificate.generation)
    .u64(certificate.createdAtMs)
    .u64(certificate.expiresAtMs)
    .finish();
}

export function certifyDevice(
  rootPrivateKey: Uint8Array,
  certificate: DeviceCertificate,
): CertifiedDevice {
  return { certificate, rootSignature: sign(rootPrivateKey, encodeDeviceCertificate(certificate)) };
}

export function verifyCertifiedDevice(
  device: CertifiedDevice,
  rootPublicKey: Uint8Array,
  nowMs: number,
): void {
  requireKey(rootPublicKey, 'Root public key');
  requireSignature(device.rootSignature, 'Root signature');
  if (nowMs < device.certificate.createdAtMs || nowMs >= device.certificate.expiresAtMs) {
    throw new CertificateError('Device certificate is not currently valid.');
  }
  if (
    !verifyStrict(rootPublicKey, encodeDeviceCertificate(device.certificate), device.rootSignature)
  ) {
    throw new CertificateError('Device certificate signature is invalid.');
  }
}

export function encodeCertifiedDevice(device: CertifiedDevice): Uint8Array {
  requireSignature(device.rootSignature, 'Root signature');
  return new ByteWriter()
    .bytes(encodeDeviceCertificate(device.certificate))
    .fixed(device.rootSignature, SIGNATURE_BYTES)
    .finish();
}

export function encodeDeviceRoster(roster: DeviceRoster): Uint8Array {
  if (roster.protocol !== E2EE_PROTOCOL || roster.version !== E2EE_VERSION) {
    throw new CertificateError('Unsupported roster protocol.');
  }
  requireIdentity(roster.userId, 'User id');
  requireKey(roster.rootPublicKey, 'Root public key');
  requireKey(roster.previousDigest, 'Previous roster digest');
  if (roster.sequence < 1 || !Number.isSafeInteger(roster.sequence)) {
    throw new CertificateError('Roster sequence is invalid.');
  }
  if (!Number.isSafeInteger(roster.createdAtMs) || roster.createdAtMs < 0) {
    throw new CertificateError('Roster creation time is invalid.');
  }
  const devices = [...roster.devices].sort(compareDevices);
  const seen = new Set<string>();
  const writer = new ByteWriter()
    .string(ROSTER_CONTEXT)
    .string(roster.protocol)
    .u8(roster.version)
    .string(E2EE_ALGORITHM)
    .string(roster.userId)
    .fixed(roster.rootPublicKey, KEY_BYTES)
    .u32(roster.sequence)
    .fixed(roster.previousDigest, KEY_BYTES)
    .u64(roster.createdAtMs)
    .u32(devices.length);
  for (const device of devices) {
    const key = `${device.certificate.deviceId}:${String(device.certificate.generation)}`;
    if (seen.has(key)) throw new CertificateError('Roster contains a duplicate device generation.');
    seen.add(key);
    writer.bytes(encodeCertifiedDevice(device));
  }
  return writer.finish();
}

export function rosterDigest(roster: DeviceRoster): Uint8Array {
  return sha256Hash(encodeDeviceRoster(roster));
}

export function signDeviceRoster(
  rootPrivateKey: Uint8Array,
  roster: DeviceRoster,
): SignedDeviceRoster {
  return { roster, rootSignature: sign(rootPrivateKey, encodeDeviceRoster(roster)) };
}

export function verifyDeviceRoster(
  signed: SignedDeviceRoster,
  previous: SignedDeviceRoster | undefined,
  nowMs: number,
): void {
  verifyRosterSnapshot(signed, nowMs);
  const { roster } = signed;
  if (previous === undefined) {
    if (roster.sequence !== 1 || !bytesEqual(roster.previousDigest, ZERO_DIGEST)) {
      throw new RosterRollbackError('Initial roster does not start the signed digest chain.');
    }
    return;
  }
  if (
    roster.userId !== previous.roster.userId ||
    !bytesEqual(roster.rootPublicKey, previous.roster.rootPublicKey) ||
    roster.sequence !== previous.roster.sequence + 1 ||
    !bytesEqual(roster.previousDigest, rosterDigest(previous.roster))
  ) {
    throw new RosterRollbackError('Roster does not extend the previously trusted roster.');
  }
}

/** Verify a trusted roster snapshot without asserting where it sits in the local digest chain. */
export function verifyRosterSnapshot(signed: SignedDeviceRoster, nowMs: number): void {
  const { roster } = signed;
  requireSignature(signed.rootSignature, 'Roster signature');
  if (!verifyStrict(roster.rootPublicKey, encodeDeviceRoster(roster), signed.rootSignature)) {
    throw new CertificateError('Roster signature is invalid.');
  }
  for (const device of roster.devices) {
    if (device.certificate.userId !== roster.userId) {
      throw new CertificateError('Roster contains a device for another user.');
    }
    verifyCertifiedDevice(device, roster.rootPublicKey, nowMs);
  }
}

function encodeSignedPreKeyStatement(
  certifiedDevice: CertifiedDevice,
  rosterDigestValue: Uint8Array,
  preKey: Omit<SignedPreKey, 'signature'>,
): Uint8Array {
  requireKey(rosterDigestValue, 'Roster digest');
  requireKey(preKey.publicKey, 'Signed prekey');
  if (
    !Number.isSafeInteger(preKey.id) ||
    preKey.id < 1 ||
    !Number.isSafeInteger(preKey.createdAtMs) ||
    !Number.isSafeInteger(preKey.expiresAtMs) ||
    preKey.expiresAtMs <= preKey.createdAtMs
  ) {
    throw new PreKeyError('Signed prekey metadata is invalid.');
  }
  return new ByteWriter()
    .string(PREKEY_CONTEXT)
    .string(E2EE_PROTOCOL)
    .u8(E2EE_VERSION)
    .string(E2EE_ALGORITHM)
    .bytes(encodeCertifiedDevice(certifiedDevice))
    .fixed(rosterDigestValue, KEY_BYTES)
    .u32(preKey.id)
    .fixed(preKey.publicKey, KEY_BYTES)
    .u64(preKey.createdAtMs)
    .u64(preKey.expiresAtMs)
    .finish();
}

export function createSignedPreKey(
  signingPrivateKey: Uint8Array,
  certifiedDevice: CertifiedDevice,
  rosterDigestValue: Uint8Array,
  preKey: Omit<SignedPreKey, 'signature'>,
): SignedPreKey {
  return {
    ...preKey,
    signature: sign(
      signingPrivateKey,
      encodeSignedPreKeyStatement(certifiedDevice, rosterDigestValue, preKey),
    ),
  };
}

export function verifyPreKeyBundle(
  bundle: PreKeyBundle,
  signedRoster: SignedDeviceRoster,
  nowMs: number,
): void {
  if (bundle.protocol !== E2EE_PROTOCOL || bundle.version !== E2EE_VERSION) {
    throw new PreKeyError('Unsupported prekey protocol.');
  }
  verifyRosterSnapshot(signedRoster, nowMs);
  if (!bytesEqual(bundle.rosterDigest, rosterDigest(signedRoster.roster))) {
    throw new PreKeyError('Prekey bundle carries an untrusted roster digest.');
  }
  const encodedDevice = encodeCertifiedDevice(bundle.certifiedDevice);
  const rosterDevice = signedRoster.roster.devices.find((candidate) =>
    bytesEqual(encodeCertifiedDevice(candidate), encodedDevice),
  );
  if (rosterDevice === undefined) throw new PreKeyError('Prekey device is absent from the roster.');
  const { signedPreKey } = bundle;
  if (nowMs < signedPreKey.createdAtMs || nowMs >= signedPreKey.expiresAtMs) {
    throw new PreKeyError('Signed prekey is not currently valid.');
  }
  const statement = encodeSignedPreKeyStatement(bundle.certifiedDevice, bundle.rosterDigest, {
    id: signedPreKey.id,
    publicKey: signedPreKey.publicKey,
    createdAtMs: signedPreKey.createdAtMs,
    expiresAtMs: signedPreKey.expiresAtMs,
  });
  if (
    !verifyStrict(
      bundle.certifiedDevice.certificate.signingPublicKey,
      statement,
      signedPreKey.signature,
    )
  ) {
    throw new PreKeyError('Signed prekey signature is invalid.');
  }
  if (bundle.oneTimePreKey !== undefined) {
    if (!Number.isSafeInteger(bundle.oneTimePreKey.id) || bundle.oneTimePreKey.id < 1) {
      throw new PreKeyError('One-time prekey id is invalid.');
    }
    requireKey(bundle.oneTimePreKey.publicKey, 'One-time prekey');
  }
}

/** Stable 60-digit root-key fingerprint; clients display it in twelve groups of five. */
export function safetyNumber(
  firstUserId: string,
  firstRootPublicKey: Uint8Array,
  secondUserId: string,
  secondRootPublicKey: Uint8Array,
): string {
  requireIdentity(firstUserId, 'First user id');
  requireIdentity(secondUserId, 'Second user id');
  requireKey(firstRootPublicKey, 'First root public key');
  requireKey(secondRootPublicKey, 'Second root public key');
  const ordered = [
    { id: firstUserId, key: firstRootPublicKey },
    { id: secondUserId, key: secondRootPublicKey },
  ].sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const first = ordered[0];
  const second = ordered[1];
  if (first === undefined || second === undefined)
    throw new CertificateError('Safety input failed.');
  let digest = sha256Hash(
    new ByteWriter()
      .string(SAFETY_NUMBER_CONTEXT)
      .string(first.id)
      .fixed(first.key, KEY_BYTES)
      .string(second.id)
      .fixed(second.key, KEY_BYTES)
      .finish(),
  );
  for (let iteration = 1; iteration < 5_200; iteration += 1) digest = sha256Hash(digest);
  let digits = '';
  for (let offset = 0; offset < 30; offset += 5) {
    const value = new DataView(digest.buffer, digest.byteOffset + offset, 5).getUint32(1, false);
    digits += value.toString().padStart(10, '0').slice(-10);
  }
  return digits;
}

export function generateDevicePrivateKeys(
  signing: KeyPair,
  agreement: KeyPair,
): { readonly signing: KeyPair; readonly agreement: KeyPair } {
  return { signing, agreement };
}
