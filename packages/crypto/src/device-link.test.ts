import { describe, expect, it } from 'vitest';

import { toHex } from './codec.js';
import {
  decodeDeviceLinkOffer,
  deviceLinkSas,
  DEVICE_LINK_OFFER_DOMAIN,
  DEVICE_LINK_OFFER_VERSION,
  encodeDeviceLinkOffer,
  signDeviceLinkOffer,
  verifyDeviceLinkOffer,
  type DeviceLinkOfferFields,
} from './device-link.js';
import { AuthenticationError, MalformedInputError } from './errors.js';
import { signingKeyPairFromPrivate } from './primitives.js';
import { E2EE_PROTOCOL } from './types.js';

function bytes(value: number): Uint8Array {
  return new Uint8Array(32).fill(value);
}

const CREATED_AT_MS = 1_700_000_000_000;
const EXPIRES_AT_MS = CREATED_AT_MS + 600_000;

const offerFields: DeviceLinkOfferFields = {
  actorId: 'actor-a',
  deviceId: 'device-new-1',
  signingPublicKey: bytes(1),
  agreementPublicKey: bytes(2),
  supportedProtocolVersions: [E2EE_PROTOCOL],
  createdAtMs: CREATED_AT_MS,
  expiresAtMs: EXPIRES_AT_MS,
};

const device = signingKeyPairFromPrivate(new Uint8Array(32).fill(9));

describe('encodeDeviceLinkOffer / decodeDeviceLinkOffer', () => {
  it('round-trips the canonical fields exactly', () => {
    const bytesEncoded = encodeDeviceLinkOffer(offerFields);
    expect(decodeDeviceLinkOffer(bytesEncoded)).toEqual(offerFields);
  });

  it('is domain- and version-tagged at a fixed offset', () => {
    const encoded = encodeDeviceLinkOffer(offerFields);
    const domainBytes = new TextEncoder().encode(DEVICE_LINK_OFFER_DOMAIN);
    expect(encoded[encoded.length - 1]).toBeDefined();
    // 4-byte length prefix + domain bytes, then the version byte.
    expect(encoded[4 + domainBytes.length]).toBe(DEVICE_LINK_OFFER_VERSION);
  });

  it('rejects trailing bytes', () => {
    const encoded = encodeDeviceLinkOffer(offerFields);
    const withTrailing = new Uint8Array(encoded.length + 1);
    withTrailing.set(encoded, 0);
    expect(() => decodeDeviceLinkOffer(withTrailing)).toThrow(MalformedInputError);
  });

  it('rejects a non-positive validity window', () => {
    expect(() =>
      encodeDeviceLinkOffer({ ...offerFields, expiresAtMs: offerFields.createdAtMs }),
    ).toThrow(MalformedInputError);
  });

  it('rejects a wrong-length key', () => {
    expect(() =>
      encodeDeviceLinkOffer({ ...offerFields, signingPublicKey: bytes(1).slice(0, 31) }),
    ).toThrow(MalformedInputError);
  });

  it('rejects non-ascending protocol versions', () => {
    expect(() =>
      encodeDeviceLinkOffer({ ...offerFields, supportedProtocolVersions: ['b', 'a'] }),
    ).toThrow(MalformedInputError);
  });
});

describe('signDeviceLinkOffer / verifyDeviceLinkOffer', () => {
  it('verifies a freshly signed offer and returns the decoded fields', () => {
    const fields: DeviceLinkOfferFields = { ...offerFields, signingPublicKey: device.publicKey };
    const signed = signDeviceLinkOffer(device.privateKey, fields);
    const verified = verifyDeviceLinkOffer({
      offerBytes: signed.offerBytes,
      deviceSignature: signed.deviceSignature,
      nowMs: CREATED_AT_MS + 1_000,
    });
    expect(verified.actorId).toBe(fields.actorId);
    expect(verified.deviceId).toBe(fields.deviceId);
    expect(toHex(verified.offerBytes)).toBe(toHex(signed.offerBytes));
  });

  it('rejects a tampered offer signature', () => {
    const fields: DeviceLinkOfferFields = { ...offerFields, signingPublicKey: device.publicKey };
    const signed = signDeviceLinkOffer(device.privateKey, fields);
    const tampered = signed.deviceSignature.slice();
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    expect(() =>
      verifyDeviceLinkOffer({
        offerBytes: signed.offerBytes,
        deviceSignature: tampered,
        nowMs: CREATED_AT_MS + 1_000,
      }),
    ).toThrow(AuthenticationError);
  });

  it('rejects tampered offer bytes even with the original signature', () => {
    const fields: DeviceLinkOfferFields = { ...offerFields, signingPublicKey: device.publicKey };
    const signed = signDeviceLinkOffer(device.privateKey, fields);
    const tamperedBytes = signed.offerBytes.slice();
    tamperedBytes[tamperedBytes.length - 1] = (tamperedBytes[tamperedBytes.length - 1] ?? 0) ^ 0xff;
    expect(() =>
      verifyDeviceLinkOffer({
        offerBytes: tamperedBytes,
        deviceSignature: signed.deviceSignature,
        nowMs: CREATED_AT_MS + 1_000,
      }),
    ).toThrow();
  });

  it('rejects an expired offer', () => {
    const fields: DeviceLinkOfferFields = { ...offerFields, signingPublicKey: device.publicKey };
    const signed = signDeviceLinkOffer(device.privateKey, fields);
    expect(() =>
      verifyDeviceLinkOffer({
        offerBytes: signed.offerBytes,
        deviceSignature: signed.deviceSignature,
        nowMs: fields.expiresAtMs,
      }),
    ).toThrow(MalformedInputError);
  });

  it('rejects an offer created too far in the future', () => {
    const fields: DeviceLinkOfferFields = { ...offerFields, signingPublicKey: device.publicKey };
    const signed = signDeviceLinkOffer(device.privateKey, fields);
    expect(() =>
      verifyDeviceLinkOffer({
        offerBytes: signed.offerBytes,
        deviceSignature: signed.deviceSignature,
        // Older than createdAtMs by more than the 5-minute skew allowance.
        nowMs: fields.createdAtMs - 6 * 60 * 1000,
      }),
    ).toThrow(MalformedInputError);
  });

  it('rejects a wrong-length signature', () => {
    const fields: DeviceLinkOfferFields = { ...offerFields, signingPublicKey: device.publicKey };
    const signed = signDeviceLinkOffer(device.privateKey, fields);
    expect(() =>
      verifyDeviceLinkOffer({
        offerBytes: signed.offerBytes,
        deviceSignature: signed.deviceSignature.slice(0, 63),
        nowMs: fields.createdAtMs + 1_000,
      }),
    ).toThrow(MalformedInputError);
  });
});

describe('deviceLinkSas', () => {
  it('is deterministic for the same offer bytes and actor id', () => {
    const encoded = encodeDeviceLinkOffer(offerFields);
    expect(deviceLinkSas(encoded, offerFields.actorId)).toBe(
      deviceLinkSas(encoded, offerFields.actorId),
    );
  });

  it('is five hyphen-separated groups of four decimal digits', () => {
    const encoded = encodeDeviceLinkOffer(offerFields);
    const sas = deviceLinkSas(encoded, offerFields.actorId);
    expect(sas).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}-\d{4}$/);
  });

  it('differs when any offer key byte changes', () => {
    const encoded = encodeDeviceLinkOffer(offerFields);
    const mutatedFields: DeviceLinkOfferFields = {
      ...offerFields,
      signingPublicKey: bytes(1).map((byte, index) => (index === 0 ? byte ^ 0xff : byte)),
    };
    const mutatedEncoded = encodeDeviceLinkOffer(mutatedFields);
    expect(deviceLinkSas(mutatedEncoded, offerFields.actorId)).not.toBe(
      deviceLinkSas(encoded, offerFields.actorId),
    );
  });

  it('differs when the actor id differs (the node cannot substitute one for the other unnoticed)', () => {
    const encoded = encodeDeviceLinkOffer(offerFields);
    expect(deviceLinkSas(encoded, 'actor-a')).not.toBe(deviceLinkSas(encoded, 'actor-b'));
  });
});
