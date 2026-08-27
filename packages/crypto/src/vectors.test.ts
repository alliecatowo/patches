import { describe, expect, it } from 'vitest';

import { concatBytes, fromHex, toHex } from './codec.js';
import {
  decodeRatchetState,
  encodeRatchetState,
  ratchetDecrypt,
  ratchetEncrypt,
} from './double-ratchet.js';
import {
  encodeDeviceEnvelopeAssociatedData,
  openDeviceEnvelope,
  sealDeviceEnvelope,
} from './device-envelope.js';
import {
  decodeDeviceLinkOffer,
  deviceLinkSas,
  encodeDeviceLinkOffer,
  signDeviceLinkOffer,
  verifyDeviceLinkOffer,
  type DeviceLinkOfferFields,
} from './device-link.js';
import {
  commitFranking,
  createNodeReportTag,
  type FrankingCommitmentContext,
  type FrankingReportTranscript,
} from './franking.js';
import {
  decodeDeviceCertificateTranscript,
  decodeDeviceRosterTranscript,
  decodeMessagingRootTranscript,
  decodePreKeyBundleTranscript,
  encodeDeviceCertificateTranscript,
  encodeDeviceRosterTranscript,
  encodeMessagingRootTranscript,
  encodePreKeyBundleTranscript,
  type DeviceCertificateTranscript,
  type DeviceRosterEntryTranscript,
  type DeviceRosterTranscript,
  type MessagingRootTranscript,
  type PreKeyBundleTranscript,
} from './identity-transcript.js';
import {
  identityTranscriptDigest,
  signDeviceCertificate,
  signDeviceRoster,
  signMessagingRoot,
  signPreKeyBundle,
} from './identity.js';
import {
  decodeSetupBlock,
  encodeInitialFraming,
  encodeSetupBlock,
  splitInitialHeader,
  type InitialSetupBlock,
} from './setup-block.js';
import {
  deterministicSource,
  establishedFixture,
  establishedRatchetPair,
} from './testing/fixtures.js';
import { E2EE_ALGORITHM, E2EE_PROTOCOL, E2EE_VERSION, type X3dhHandshake } from './types.js';
import type { DoubleRatchetState, EncryptedRatchetMessage } from './types.js';
import deviceEnvelopeVector from './vectors/device-envelope.json' with { type: 'json' };
import deviceLinkVector from './vectors/device-link.json' with { type: 'json' };
import identityVector from './vectors/identity-transcripts.json' with { type: 'json' };
import doubleRatchetVector from './vectors/double-ratchet-session.json' with { type: 'json' };
import frankingVector from './vectors/franking.json' with { type: 'json' };
import setupBlockVector from './vectors/setup-block.json' with { type: 'json' };
import x3dhVector from './vectors/x3dh-handshake.json' with { type: 'json' };

const encoder = new TextEncoder();

/**
 * These tests recompute every vector from its recorded `seed`/inputs using the current
 * implementation and assert byte-for-byte equality with the checked-in JSON. A failure here
 * means either an unintentional protocol regression (fix the code) or a deliberate change (run
 * `pnpm exec tsx packages/crypto/scripts/generate-vectors.ts` and review the resulting diff).
 */
describe('vector replay: canonical identity transcripts', () => {
  const rootPrivateKey = fromHex(identityVector.keys.rootPrivateKeyHex);
  const devicePrivateKey = fromHex(identityVector.keys.deviceSigningPrivateKeyHex);

  const rootFields: MessagingRootTranscript = {
    actorId: identityVector.messagingRoot.fields.actorId,
    generation: identityVector.messagingRoot.fields.generation,
    publicKey: fromHex(identityVector.messagingRoot.fields.publicKeyHex),
    createdAtMs: identityVector.messagingRoot.fields.createdAtMs,
  };
  const certificateFields: DeviceCertificateTranscript = {
    actorId: identityVector.deviceCertificate.fields.actorId,
    deviceId: identityVector.deviceCertificate.fields.deviceId,
    rootGeneration: identityVector.deviceCertificate.fields.rootGeneration,
    rootPublicKey: fromHex(identityVector.deviceCertificate.fields.rootPublicKeyHex),
    certificateVersion: identityVector.deviceCertificate.fields.certificateVersion,
    signingPublicKey: fromHex(identityVector.deviceCertificate.fields.signingPublicKeyHex),
    agreementPublicKey: fromHex(identityVector.deviceCertificate.fields.agreementPublicKeyHex),
    supportedProtocolVersions: identityVector.deviceCertificate.fields.supportedProtocolVersions,
    createdAtMs: identityVector.deviceCertificate.fields.createdAtMs,
    expiresAtMs: identityVector.deviceCertificate.fields.expiresAtMs,
  };
  const rosterFields: DeviceRosterTranscript = {
    actorId: identityVector.deviceRoster.fields.actorId,
    rootGeneration: identityVector.deviceRoster.fields.rootGeneration,
    rootPublicKey: fromHex(identityVector.deviceRoster.fields.rootPublicKeyHex),
    sequence: identityVector.deviceRoster.fields.sequence,
    previousDigest: fromHex(identityVector.deviceRoster.fields.previousDigestHex),
    createdAtMs: identityVector.deviceRoster.fields.createdAtMs,
    entries: identityVector.deviceRoster.fields.entries.map(
      (entry): DeviceRosterEntryTranscript => ({
        deviceId: entry.deviceId,
        certificateDigest: fromHex(entry.certificateDigestHex),
        active: entry.active,
        addedAtMs: entry.addedAtMs,
        ...(entry.revokedAtMs === null ? {} : { revokedAtMs: entry.revokedAtMs }),
      }),
    ),
  };
  const bundleFields: PreKeyBundleTranscript = {
    actorId: identityVector.preKeyBundle.fields.actorId,
    deviceId: identityVector.preKeyBundle.fields.deviceId,
    certificateDigest: fromHex(identityVector.preKeyBundle.fields.certificateDigestHex),
    signedPrekeyId: identityVector.preKeyBundle.fields.signedPrekeyId,
    signedPrekeyPublicKey: fromHex(identityVector.preKeyBundle.fields.signedPrekeyPublicKeyHex),
    createdAtMs: identityVector.preKeyBundle.fields.createdAtMs,
    expiresAtMs: identityVector.preKeyBundle.fields.expiresAtMs,
  };

  it('reproduces the recorded bytes, digests, and signatures for all four transcripts', () => {
    const root = signMessagingRoot(rootPrivateKey, rootFields);
    expect(toHex(root.rootBytes)).toBe(identityVector.messagingRoot.transcriptHex);
    expect(toHex(identityTranscriptDigest(root.rootBytes))).toBe(
      identityVector.messagingRoot.digestHex,
    );
    expect(toHex(root.selfSignature)).toBe(identityVector.messagingRoot.selfSignatureHex);

    const certificate = signDeviceCertificate(rootPrivateKey, certificateFields);
    expect(toHex(certificate.certificateBytes)).toBe(
      identityVector.deviceCertificate.transcriptHex,
    );
    expect(toHex(certificate.certificateDigest)).toBe(identityVector.deviceCertificate.digestHex);
    expect(toHex(certificate.rootSignature)).toBe(
      identityVector.deviceCertificate.rootSignatureHex,
    );

    const roster = signDeviceRoster(rootPrivateKey, rosterFields);
    expect(toHex(roster.rosterBytes)).toBe(identityVector.deviceRoster.transcriptHex);
    expect(toHex(roster.rosterDigest)).toBe(identityVector.deviceRoster.digestHex);
    expect(toHex(roster.rootSignature)).toBe(identityVector.deviceRoster.rootSignatureHex);

    const bundle = signPreKeyBundle(devicePrivateKey, bundleFields);
    expect(toHex(bundle.bundleBytes)).toBe(identityVector.preKeyBundle.transcriptHex);
    expect(toHex(identityTranscriptDigest(bundle.bundleBytes))).toBe(
      identityVector.preKeyBundle.digestHex,
    );
    expect(toHex(bundle.deviceSignature)).toBe(identityVector.preKeyBundle.deviceSignatureHex);
  });

  it('decodes the recorded bytes back to the recorded field sets', () => {
    expect(
      decodeMessagingRootTranscript(fromHex(identityVector.messagingRoot.transcriptHex)),
    ).toEqual(rootFields);
    expect(
      decodeDeviceCertificateTranscript(fromHex(identityVector.deviceCertificate.transcriptHex)),
    ).toEqual(certificateFields);
    expect(
      decodeDeviceRosterTranscript(fromHex(identityVector.deviceRoster.transcriptHex)),
    ).toEqual(rosterFields);
    expect(
      decodePreKeyBundleTranscript(fromHex(identityVector.preKeyBundle.transcriptHex)),
    ).toEqual(bundleFields);
    // Re-encoding a decoded view must reproduce the same bytes: one fact, one encoding.
    expect(toHex(encodeMessagingRootTranscript(rootFields))).toBe(
      identityVector.messagingRoot.transcriptHex,
    );
    expect(toHex(encodeDeviceCertificateTranscript(certificateFields))).toBe(
      identityVector.deviceCertificate.transcriptHex,
    );
    expect(toHex(encodeDeviceRosterTranscript(rosterFields))).toBe(
      identityVector.deviceRoster.transcriptHex,
    );
    expect(toHex(encodePreKeyBundleTranscript(bundleFields))).toBe(
      identityVector.preKeyBundle.transcriptHex,
    );
  });

  it('rejects every recorded negative case', () => {
    const decoders: Record<string, (value: Uint8Array) => unknown> = {
      messagingRoot: decodeMessagingRootTranscript,
      deviceCertificate: decodeDeviceCertificateTranscript,
      deviceRoster: decodeDeviceRosterTranscript,
      preKeyBundle: decodePreKeyBundleTranscript,
    };
    expect(identityVector.rejected.length).toBeGreaterThan(0);
    for (const negative of identityVector.rejected) {
      const decode = decoders[negative.transcript];
      if (decode === undefined) throw new Error(`Unknown vector transcript ${negative.transcript}`);
      expect(() => decode(fromHex(negative.inputHex)), negative.name).toThrow();
    }
  });
});

describe('vector replay: X3DH handshake', () => {
  it('reproduces the recorded transcript-bound X3DH outputs', () => {
    const fixture = establishedFixture(x3dhVector.seed);
    expect(toHex(fixture.initiated.handshake.initiatorSignature)).toBe(
      x3dhVector.initiatorSignatureHex,
    );
    expect(toHex(fixture.initiated.handshake.ephemeralPublicKey)).toBe(
      x3dhVector.ephemeralPublicKeyHex,
    );
    expect(fixture.responded.consumedOneTimePreKeyId ?? null).toBe(
      x3dhVector.consumedOneTimePreKeyId,
    );
    expect(toHex(fixture.initiated.secrets.rootKey)).toBe(x3dhVector.rootKeyHex);
    expect(toHex(fixture.initiated.secrets.initiatorHeaderKey)).toBe(
      x3dhVector.initiatorHeaderKeyHex,
    );
    expect(toHex(fixture.initiated.secrets.responderHeaderKey)).toBe(
      x3dhVector.responderHeaderKeyHex,
    );
    expect(fixture.responded.secrets).toEqual(fixture.initiated.secrets);
  });
});

describe('vector replay: Double Ratchet out-of-order session', () => {
  it('reproduces every recorded ciphertext and the final serialized receiver state', () => {
    const { aliceState, bobState } = establishedRatchetPair(doubleRatchetVector.seed);
    const ad = encoder.encode(doubleRatchetVector.associatedData);
    const source = deterministicSource(doubleRatchetVector.seed);
    const receiverSource = deterministicSource(doubleRatchetVector.seed + 1);

    let sender = aliceState;
    const regenerated: EncryptedRatchetMessage[] = [];
    for (const message of doubleRatchetVector.messages) {
      const encrypted = ratchetEncrypt(sender, encoder.encode(message.plaintext), ad, source);
      sender = encrypted.state;
      expect(toHex(encrypted.output.encryptedHeader)).toBe(message.encryptedHeaderHex);
      expect(toHex(encrypted.output.ciphertext)).toBe(message.ciphertextHex);
      regenerated.push(encrypted.output);
    }

    let receiver: DoubleRatchetState = bobState;
    const decrypted: string[] = [];
    for (const index of doubleRatchetVector.deliveryOrder) {
      const message = regenerated[index];
      if (message === undefined) throw new Error('Vector delivery index out of range.');
      const opened = ratchetDecrypt(receiver, message, ad, receiverSource);
      receiver = opened.state;
      decrypted.push(new TextDecoder().decode(opened.output));
    }
    expect(decrypted).toEqual(doubleRatchetVector.decryptedInDeliveryOrder);
    expect(receiver.skippedMessageKeys.size).toBe(doubleRatchetVector.finalReceiverSkippedKeyCount);

    const encodedState = toHex(encodeRatchetState(receiver));
    expect(encodedState).toBe(doubleRatchetVector.finalReceiverStateHex);
    expect(decodeRatchetState(fromHex(encodedState))).toEqual(receiver);
  });
});

describe('vector replay: franking commitment and node report tag', () => {
  it('reproduces the recorded commitment and node report tag from fixed hex inputs', () => {
    const openingKey = fromHex(frankingVector.openingKeyHex);
    const nodeFrankingKey = fromHex(frankingVector.nodeFrankingKeyHex);
    const plaintext = encoder.encode(frankingVector.plaintextUtf8);
    const context: FrankingCommitmentContext = frankingVector.context;
    const commitment = commitFranking(openingKey, context, plaintext);
    expect(toHex(commitment)).toBe(frankingVector.commitmentHex);
    expect(
      toHex(
        encodeDeviceEnvelopeAssociatedData(
          context,
          { recipientActorId: 'bob', recipientDeviceId: 'bob-device' },
          frankingVector.logicalMessageId,
          commitment,
        ),
      ),
    ).toBe(frankingVector.envelopeAssociatedDataHex);

    const transcript: FrankingReportTranscript = {
      frankingProfile: frankingVector.transcript.frankingProfile,
      frankingKeyEra: frankingVector.transcript.frankingKeyEra,
      conversationId: frankingVector.transcript.conversationId,
      membershipEpoch: frankingVector.transcript.membershipEpoch,
      logicalMessageId: frankingVector.transcript.logicalMessageId,
      senderActorId: frankingVector.transcript.senderActorId,
      senderDeviceId: frankingVector.transcript.senderDeviceId,
      recipientFanoutDigest: fromHex(frankingVector.transcript.recipientFanoutDigestHex),
      acceptedAtMs: frankingVector.transcript.acceptedAtMs,
      commitment,
      ciphertextDigests: frankingVector.transcript.ciphertextDigestsHex.map((hex) => fromHex(hex)),
    };
    const tag = createNodeReportTag(nodeFrankingKey, transcript);
    expect(toHex(tag)).toBe(frankingVector.nodeReportTagHex);
  });
});

describe('vector replay: ADR 0025 device envelope', () => {
  it('reproduces the recorded sealed envelope and opens it back to the same opening', () => {
    const { aliceState, bobState } = establishedRatchetPair(deviceEnvelopeVector.seed);
    const context: FrankingCommitmentContext = deviceEnvelopeVector.context;
    const recipient = deviceEnvelopeVector.recipient;
    const logicalMessageId: string = deviceEnvelopeVector.logicalMessageId;
    const openingKey = fromHex(deviceEnvelopeVector.openingKeyHex);
    const plaintext = encoder.encode(deviceEnvelopeVector.plaintextUtf8);
    const commitment = commitFranking(openingKey, context, plaintext);
    expect(toHex(commitment)).toBe(deviceEnvelopeVector.commitmentHex);
    expect(
      toHex(encodeDeviceEnvelopeAssociatedData(context, recipient, logicalMessageId, commitment)),
    ).toBe(deviceEnvelopeVector.associatedDataHex);

    const sealed = sealDeviceEnvelope(
      aliceState,
      { context, recipient, logicalMessageId, plaintext, openingKey, commitment },
      deterministicSource(deviceEnvelopeVector.seed),
    );
    expect(toHex(sealed.output.encryptedHeader)).toBe(deviceEnvelopeVector.encryptedHeaderHex);
    expect(toHex(sealed.output.ciphertext)).toBe(deviceEnvelopeVector.ciphertextHex);

    const opened = openDeviceEnvelope(
      bobState,
      { context, recipient, logicalMessageId, message: sealed.output, commitment },
      deterministicSource(deviceEnvelopeVector.seed + 1),
    );
    expect(opened.output.plaintext).toEqual(plaintext);
    expect(toHex(opened.output.openingKey)).toBe(deviceEnvelopeVector.openingKeyHex);
  });
});

describe('vector replay: ADR 0037 device-link offer', () => {
  const devicePrivateKey = fromHex(deviceLinkVector.keys.deviceSigningPrivateKeyHex);
  const offerFields: DeviceLinkOfferFields = {
    actorId: deviceLinkVector.offer.fields.actorId,
    deviceId: deviceLinkVector.offer.fields.deviceId,
    signingPublicKey: fromHex(deviceLinkVector.offer.fields.signingPublicKeyHex),
    agreementPublicKey: fromHex(deviceLinkVector.offer.fields.agreementPublicKeyHex),
    supportedProtocolVersions: deviceLinkVector.offer.fields.supportedProtocolVersions,
    createdAtMs: deviceLinkVector.offer.fields.createdAtMs,
    expiresAtMs: deviceLinkVector.offer.fields.expiresAtMs,
  };

  it('reproduces the recorded transcript bytes, signature, and SAS', () => {
    expect(toHex(encodeDeviceLinkOffer(offerFields))).toBe(deviceLinkVector.offer.transcriptHex);
    const signed = signDeviceLinkOffer(devicePrivateKey, offerFields);
    expect(toHex(signed.offerBytes)).toBe(deviceLinkVector.offer.transcriptHex);
    expect(toHex(signed.deviceSignature)).toBe(deviceLinkVector.offer.deviceSignatureHex);
    expect(deviceLinkSas(signed.offerBytes, offerFields.actorId)).toBe(deviceLinkVector.sas.value);
  });

  it('decodes the recorded bytes back to the recorded field set', () => {
    expect(decodeDeviceLinkOffer(fromHex(deviceLinkVector.offer.transcriptHex))).toEqual(
      offerFields,
    );
  });

  it('verifies the recorded offer at the recorded time', () => {
    const verified = verifyDeviceLinkOffer({
      offerBytes: fromHex(deviceLinkVector.offer.transcriptHex),
      deviceSignature: fromHex(deviceLinkVector.offer.deviceSignatureHex),
      nowMs: deviceLinkVector.offer.verifiedAtMs,
    });
    expect(verified.actorId).toBe(offerFields.actorId);
    expect(verified.deviceId).toBe(offerFields.deviceId);
  });

  it('rejects every recorded negative case', () => {
    expect(deviceLinkVector.rejected.length).toBeGreaterThan(0);
    for (const negative of deviceLinkVector.rejected) {
      expect(
        () =>
          verifyDeviceLinkOffer({
            offerBytes: fromHex(negative.offerHex),
            deviceSignature: fromHex(negative.signatureHex),
            nowMs: negative.nowMs,
          }),
        negative.name,
      ).toThrow();
    }
  });
});

describe('vector replay: ADR 0034 Stage 0(a) setup-block framing (issue #155)', () => {
  interface SetupBlockHandshakeFields {
    readonly initiatorRosterDigestHex: string;
    readonly responderRosterDigestHex: string;
    readonly ephemeralPublicKeyHex: string;
    readonly signedPreKeyId: number;
    readonly signedPreKeyPublicKeyHex: string;
    readonly oneTimePreKeyId: number | null;
    readonly oneTimePreKeyPublicKeyHex: string | null;
    readonly initiatorSignatureHex: string;
  }

  // `encodeSetupBlock` reads only the fields below off `X3dhHandshake`; `initiator`/`responder`
  // are certificate material the setup-block framing never touches, so empty placeholders satisfy
  // the type without misrepresenting what this vector pins.
  const placeholderDevice = {
    certificateBytes: new Uint8Array(0),
    rootSignature: new Uint8Array(0),
  };

  function handshakeOf(fields: SetupBlockHandshakeFields): X3dhHandshake {
    return {
      protocol: E2EE_PROTOCOL,
      version: E2EE_VERSION,
      algorithm: E2EE_ALGORITHM,
      initiator: placeholderDevice,
      responder: placeholderDevice,
      initiatorRosterDigest: fromHex(fields.initiatorRosterDigestHex),
      responderRosterDigest: fromHex(fields.responderRosterDigestHex),
      ephemeralPublicKey: fromHex(fields.ephemeralPublicKeyHex),
      signedPreKeyId: fields.signedPreKeyId,
      signedPreKeyPublicKey: fromHex(fields.signedPreKeyPublicKeyHex),
      ...(fields.oneTimePreKeyId === null
        ? {}
        : {
            oneTimePreKeyId: fields.oneTimePreKeyId,
            oneTimePreKeyPublicKey: fromHex(fields.oneTimePreKeyPublicKeyHex ?? ''),
          }),
      initiatorSignature: fromHex(fields.initiatorSignatureHex),
    };
  }

  it.each(['withOneTimePreKey', 'withoutOneTimePreKey'] as const)(
    'reproduces the recorded setup block and envelope framing (%s)',
    (caseName) => {
      const vector = setupBlockVector[caseName];
      const handshake = handshakeOf(vector.handshake);

      const setupBlock = encodeSetupBlock(setupBlockVector.identity, handshake);
      expect(toHex(setupBlock)).toBe(vector.setupBlockHex);

      const decoded: InitialSetupBlock = decodeSetupBlock(setupBlock);
      expect(decoded.senderActorId).toBe(setupBlockVector.identity.actorId);
      expect(decoded.senderDeviceId).toBe(setupBlockVector.identity.deviceId);
      expect(toHex(decoded.handshake.initiatorSignature)).toBe(
        vector.handshake.initiatorSignatureHex,
      );

      const framed = encodeInitialFraming(setupBlock);
      const envelope = concatBytes(framed, fromHex(vector.ratchetHeaderHex));
      expect(toHex(envelope)).toBe(vector.envelopeHeaderHex);

      const split = splitInitialHeader(envelope);
      expect(toHex(split.ratchetHeader)).toBe(vector.ratchetHeaderHex);
      expect(split.setup.senderActorId).toBe(setupBlockVector.identity.actorId);
    },
  );

  it('rejects every recorded negative case', () => {
    expect(setupBlockVector.rejected.length).toBeGreaterThan(0);
    for (const negative of setupBlockVector.rejected) {
      const input = fromHex(negative.inputHex);
      const decode =
        negative.decoder === 'decodeSetupBlock' ? decodeSetupBlock : splitInitialHeader;
      expect(() => decode(input), negative.name).toThrow();
    }
  });
});
