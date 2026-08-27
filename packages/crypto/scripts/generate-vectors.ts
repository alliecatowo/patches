/**
 * One-off generator for `src/vectors/*.json`. Not part of the build or the verify pipeline —
 * regenerate deliberately (`pnpm exec tsx packages/crypto/scripts/generate-vectors.ts` from the
 * repo root) whenever a protocol change intentionally alters the wire bytes, then run
 * `pnpm exec prettier --write packages/crypto/src/vectors` (the JSON is checked in formatted) and
 * re-review the diff. `src/vectors.test.ts` replays the checked-in JSON on every `pnpm test` run
 * to catch unintentional drift.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ByteWriter, toHex } from '../src/codec.js';
import {
  deviceLinkSas,
  signDeviceLinkOffer,
  verifyDeviceLinkOffer,
  type DeviceLinkOfferFields,
} from '../src/device-link.js';
import {
  E2EE_IDENTITY_TRANSCRIPT_DOMAIN,
  E2EE_IDENTITY_TRANSCRIPT_TAGS,
  E2EE_IDENTITY_TRANSCRIPT_VERSION,
  type DeviceCertificateTranscript,
  type DeviceRosterTranscript,
  type MessagingRootTranscript,
  type PreKeyBundleTranscript,
} from '../src/identity-transcript.js';
import {
  identityTranscriptDigest,
  signDeviceCertificate,
  signDeviceRoster,
  signMessagingRoot,
  signPreKeyBundle,
} from '../src/identity.js';
import { keyAgreementKeyPairFromPrivate, signingKeyPairFromPrivate } from '../src/primitives.js';
import { fixtureBytes } from '../src/testing/fixtures.js';
import { E2EE_PROTOCOL } from '../src/types.js';
import {
  decodeRatchetState,
  encodeRatchetState,
  ratchetDecrypt,
  ratchetEncrypt,
} from '../src/double-ratchet.js';
import {
  encodeDeviceEnvelopeAssociatedData,
  openDeviceEnvelope,
  sealDeviceEnvelope,
} from '../src/device-envelope.js';
import {
  commitFranking,
  createNodeReportTag,
  type FrankingCommitmentContext,
  type FrankingReportTranscript,
} from '../src/franking.js';
import { sha256Hash } from '../src/primitives.js';
import {
  deterministicSource,
  establishedFixture,
  establishedRatchetPair,
} from '../src/testing/fixtures.js';
import type { DoubleRatchetState } from '../src/types.js';

const vectorsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'vectors');
const encoder = new TextEncoder();

function writeJson(name: string, value: unknown): void {
  writeFileSync(join(vectorsDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * ADR 0033 §6: the one canonical identity transcript family, for one deterministic seed, plus a
 * table of hex inputs any conforming decoder must reject. Private keys are included because they
 * are synthetic fixture scalars and a second implementation needs them to reproduce the
 * signatures, not only the bytes.
 */
function generateIdentityTranscriptsVector(): void {
  const seed = 404;
  const rootKeyPair = signingKeyPairFromPrivate(fixtureBytes(seed));
  const deviceSigning = signingKeyPairFromPrivate(fixtureBytes(seed + 1));
  const deviceAgreement = keyAgreementKeyPairFromPrivate(fixtureBytes(seed + 2));
  const signedPrekey = keyAgreementKeyPairFromPrivate(fixtureBytes(seed + 3));
  const createdAtMs = 1_700_000_000_000;

  const rootFields: MessagingRootTranscript = {
    actorId: 'actor-vector',
    generation: 1,
    publicKey: rootKeyPair.publicKey,
    createdAtMs,
  };
  const root = signMessagingRoot(rootKeyPair.privateKey, rootFields);

  const certificateFields: DeviceCertificateTranscript = {
    actorId: rootFields.actorId,
    deviceId: 'device-vector-a',
    rootGeneration: 1,
    rootPublicKey: rootKeyPair.publicKey,
    certificateVersion: 1,
    signingPublicKey: deviceSigning.publicKey,
    agreementPublicKey: deviceAgreement.publicKey,
    supportedProtocolVersions: [E2EE_PROTOCOL],
    createdAtMs,
    expiresAtMs: createdAtMs + 86_400_000,
  };
  const certificate = signDeviceCertificate(rootKeyPair.privateKey, certificateFields);

  const rosterFields: DeviceRosterTranscript = {
    actorId: rootFields.actorId,
    rootGeneration: 1,
    rootPublicKey: rootKeyPair.publicKey,
    sequence: 1,
    previousDigest: new Uint8Array(32),
    createdAtMs,
    entries: [
      {
        deviceId: certificateFields.deviceId,
        certificateDigest: certificate.certificateDigest,
        active: true,
        addedAtMs: createdAtMs,
      },
      {
        deviceId: 'device-vector-b',
        certificateDigest: sha256Hash(encoder.encode('vector-revoked-device-certificate')),
        active: false,
        addedAtMs: createdAtMs,
        revokedAtMs: createdAtMs + 1_000,
      },
    ],
  };
  const roster = signDeviceRoster(rootKeyPair.privateKey, rosterFields);

  const bundleFields: PreKeyBundleTranscript = {
    actorId: rootFields.actorId,
    deviceId: certificateFields.deviceId,
    certificateDigest: certificate.certificateDigest,
    signedPrekeyId: 2 ** 33 + 7,
    signedPrekeyPublicKey: signedPrekey.publicKey,
    createdAtMs,
    expiresAtMs: createdAtMs + 604_800_000,
  };
  const bundle = signPreKeyBundle(deviceSigning.privateKey, bundleFields);

  const domainByteLength = encoder.encode(E2EE_IDENTITY_TRANSCRIPT_DOMAIN).length;
  const versionOffset = 4 + domainByteLength;
  const tagOffset = versionOffset + 1;
  const mutated = (offset: number, value: number): Uint8Array => {
    const copy = roster.rosterBytes.slice();
    copy[offset] = value;
    return copy;
  };
  const descendingEntries = ((): Uint8Array => {
    const writer = new ByteWriter()
      .string(E2EE_IDENTITY_TRANSCRIPT_DOMAIN)
      .u8(E2EE_IDENTITY_TRANSCRIPT_VERSION)
      .u8(E2EE_IDENTITY_TRANSCRIPT_TAGS.deviceRoster)
      .string(rosterFields.actorId)
      .u32(rosterFields.rootGeneration)
      .fixed(rosterFields.rootPublicKey, 32)
      .u64(rosterFields.sequence)
      .fixed(rosterFields.previousDigest, 32)
      .u64(rosterFields.createdAtMs)
      .u32(2);
    for (const deviceId of ['device-vector-b', 'device-vector-a']) {
      writer
        .string(deviceId)
        .fixed(certificate.certificateDigest, 32)
        .u8(1)
        .u64(createdAtMs)
        .u8(0)
        .u64(0);
    }
    return writer.finish();
  })();
  const trailing = new Uint8Array(roster.rosterBytes.length + 1);
  trailing.set(roster.rosterBytes, 0);

  writeJson('identity-transcripts.json', {
    description:
      'The one canonical E2EE identity transcript family (ADR 0033 §2) for a single fixed seed: ' +
      'messaging root (T1), device certificate (T2), device roster (T3), and prekey bundle (T4), ' +
      'each with its exact transcript bytes, SHA-256 digest, and signature — plus hex inputs a ' +
      'conforming decoder must reject. Replayed by src/vectors.test.ts.',
    seed,
    keys: {
      rootPrivateKeyHex: toHex(rootKeyPair.privateKey),
      rootPublicKeyHex: toHex(rootKeyPair.publicKey),
      deviceSigningPrivateKeyHex: toHex(deviceSigning.privateKey),
      deviceSigningPublicKeyHex: toHex(deviceSigning.publicKey),
      deviceAgreementPublicKeyHex: toHex(deviceAgreement.publicKey),
      signedPrekeyPublicKeyHex: toHex(signedPrekey.publicKey),
    },
    messagingRoot: {
      fields: {
        actorId: rootFields.actorId,
        generation: rootFields.generation,
        publicKeyHex: toHex(rootFields.publicKey),
        createdAtMs: rootFields.createdAtMs,
      },
      transcriptHex: toHex(root.rootBytes),
      digestHex: toHex(identityTranscriptDigest(root.rootBytes)),
      selfSignatureHex: toHex(root.selfSignature),
    },
    deviceCertificate: {
      fields: {
        actorId: certificateFields.actorId,
        deviceId: certificateFields.deviceId,
        rootGeneration: certificateFields.rootGeneration,
        rootPublicKeyHex: toHex(certificateFields.rootPublicKey),
        certificateVersion: certificateFields.certificateVersion,
        signingPublicKeyHex: toHex(certificateFields.signingPublicKey),
        agreementPublicKeyHex: toHex(certificateFields.agreementPublicKey),
        supportedProtocolVersions: certificateFields.supportedProtocolVersions,
        createdAtMs: certificateFields.createdAtMs,
        expiresAtMs: certificateFields.expiresAtMs,
      },
      transcriptHex: toHex(certificate.certificateBytes),
      digestHex: toHex(certificate.certificateDigest),
      rootSignatureHex: toHex(certificate.rootSignature),
    },
    deviceRoster: {
      fields: {
        actorId: rosterFields.actorId,
        rootGeneration: rosterFields.rootGeneration,
        rootPublicKeyHex: toHex(rosterFields.rootPublicKey),
        sequence: rosterFields.sequence,
        previousDigestHex: toHex(rosterFields.previousDigest),
        createdAtMs: rosterFields.createdAtMs,
        entries: rosterFields.entries.map((entry) => ({
          deviceId: entry.deviceId,
          certificateDigestHex: toHex(entry.certificateDigest),
          active: entry.active,
          addedAtMs: entry.addedAtMs,
          revokedAtMs: entry.revokedAtMs ?? null,
        })),
      },
      transcriptHex: toHex(roster.rosterBytes),
      digestHex: toHex(roster.rosterDigest),
      rootSignatureHex: toHex(roster.rootSignature),
    },
    preKeyBundle: {
      fields: {
        actorId: bundleFields.actorId,
        deviceId: bundleFields.deviceId,
        certificateDigestHex: toHex(bundleFields.certificateDigest),
        signedPrekeyId: bundleFields.signedPrekeyId,
        signedPrekeyPublicKeyHex: toHex(bundleFields.signedPrekeyPublicKey),
        createdAtMs: bundleFields.createdAtMs,
        expiresAtMs: bundleFields.expiresAtMs,
      },
      transcriptHex: toHex(bundle.bundleBytes),
      digestHex: toHex(identityTranscriptDigest(bundle.bundleBytes)),
      deviceSignatureHex: toHex(bundle.deviceSignature),
    },
    rejected: [
      {
        name: 'wrong tag',
        transcript: 'deviceRoster',
        inputHex: toHex(mutated(tagOffset, E2EE_IDENTITY_TRANSCRIPT_TAGS.preKeyBundle)),
      },
      {
        name: 'wrong version',
        transcript: 'deviceRoster',
        inputHex: toHex(mutated(versionOffset, 2)),
      },
      {
        name: 'wrong domain',
        transcript: 'deviceRoster',
        // Last byte of 'patches-e2ee/identity-v1' -> '2'; same length, so only the domain differs.
        inputHex: toHex(mutated(4 + domainByteLength - 1, 0x32)),
      },
      {
        name: 'non-ascending entries',
        transcript: 'deviceRoster',
        inputHex: toHex(descendingEntries),
      },
      { name: 'trailing bytes', transcript: 'deviceRoster', inputHex: toHex(trailing) },
    ],
  });
}

function generateX3dhVector(): void {
  const seed = 101;
  const fixture = establishedFixture(seed);
  writeJson('x3dh-handshake.json', {
    description:
      'Transcript-bound X3DH handshake between two synthetic certified devices, derived ' +
      'entirely from `seed` via src/testing/fixtures.ts. Replayed by src/vectors.test.ts.',
    seed,
    nowMs: 10_000,
    initiatorSignatureHex: toHex(fixture.initiated.handshake.initiatorSignature),
    ephemeralPublicKeyHex: toHex(fixture.initiated.handshake.ephemeralPublicKey),
    consumedOneTimePreKeyId: fixture.responded.consumedOneTimePreKeyId ?? null,
    rootKeyHex: toHex(fixture.initiated.secrets.rootKey),
    initiatorHeaderKeyHex: toHex(fixture.initiated.secrets.initiatorHeaderKey),
    responderHeaderKeyHex: toHex(fixture.initiated.secrets.responderHeaderKey),
  });
}

function generateDoubleRatchetVector(): void {
  const seed = 202;
  const messageCount = 8;
  const deliveryOrder = [3, 0, 5, 1, 7, 2, 6, 4];
  const { aliceState, bobState } = establishedRatchetPair(seed);
  const associatedData = 'conversation-vector/device-pair-a-b';
  const ad = encoder.encode(associatedData);
  const source = deterministicSource(seed);
  const receiverSource = deterministicSource(seed + 1);

  let sender = aliceState;
  const messages: { plaintext: string; encryptedHeaderHex: string; ciphertextHex: string }[] = [];
  for (let index = 0; index < messageCount; index += 1) {
    const plaintext = `vector message ${String(index)}`;
    const encrypted = ratchetEncrypt(sender, encoder.encode(plaintext), ad, source);
    sender = encrypted.state;
    messages.push({
      plaintext,
      encryptedHeaderHex: toHex(encrypted.output.encryptedHeader),
      ciphertextHex: toHex(encrypted.output.ciphertext),
    });
  }

  let receiver: DoubleRatchetState = bobState;
  const decryptedInDeliveryOrder: string[] = [];
  for (const index of deliveryOrder) {
    const message = messages[index];
    if (message === undefined) throw new Error('Vector generation index out of range.');
    const opened = ratchetDecrypt(
      receiver,
      {
        encryptedHeader: Uint8Array.from(Buffer.from(message.encryptedHeaderHex, 'hex')),
        ciphertext: Uint8Array.from(Buffer.from(message.ciphertextHex, 'hex')),
      },
      ad,
      receiverSource,
    );
    receiver = opened.state;
    decryptedInDeliveryOrder.push(new TextDecoder().decode(opened.output));
  }

  const finalReceiverStateHex = toHex(encodeRatchetState(receiver));
  // Self-check before writing: decoding must reproduce byte-identical state and re-encoding
  // must reproduce byte-identical bytes.
  const roundTripped = decodeRatchetState(encodeRatchetState(receiver));
  if (toHex(encodeRatchetState(roundTripped)) !== finalReceiverStateHex) {
    throw new Error('Ratchet state serialization round trip is not stable; refusing to write.');
  }

  writeJson('double-ratchet-session.json', {
    description:
      'One-directional 8-message Double Ratchet session (alice -> bob) delivered out of order, ' +
      'plus the receiver state serialized after all messages land. Replayed by src/vectors.test.ts.',
    seed,
    associatedData,
    messages,
    deliveryOrder,
    decryptedInDeliveryOrder,
    finalReceiverSkippedKeyCount: receiver.skippedMessageKeys.size,
    finalReceiverStateHex,
  });
}

function generateFrankingVector(): void {
  const openingKey = sha256Hash(encoder.encode('vector-franking-opening-key'));
  const nodeFrankingKey = sha256Hash(encoder.encode('vector-node-franking-key-era-1'));
  const plaintext = encoder.encode('vector reported message body');
  const context: FrankingCommitmentContext = {
    frankingProfile: 'patches-franking-v1',
    conversationId: 'vector-conversation',
    membershipEpoch: 1,
    senderActorId: 'alice',
    senderDeviceId: 'alice-device',
  };
  const commitment = commitFranking(openingKey, context, plaintext);
  const transcript: FrankingReportTranscript = {
    frankingProfile: context.frankingProfile,
    frankingKeyEra: 1,
    conversationId: 'vector-conversation',
    membershipEpoch: 1,
    logicalMessageId: 'vector-message-1',
    senderActorId: 'alice',
    senderDeviceId: 'alice-device',
    recipientFanoutDigest: sha256Hash(encoder.encode('vector-fanout')),
    acceptedAtMs: 1_700_000_000_000,
    commitment,
    ciphertextDigests: [
      sha256Hash(encoder.encode('vector-ciphertext-1')),
      sha256Hash(encoder.encode('vector-ciphertext-2')),
    ],
  };
  const tag = createNodeReportTag(nodeFrankingKey, transcript);

  writeJson('franking.json', {
    description:
      'Fixed franking commitment and node report tag over hand-specified hex material (no ' +
      'randomness). Replayed by src/vectors.test.ts.',
    openingKeyHex: toHex(openingKey),
    nodeFrankingKeyHex: toHex(nodeFrankingKey),
    plaintextUtf8: 'vector reported message body',
    context,
    commitmentHex: toHex(commitment),
    logicalMessageId: transcript.logicalMessageId,
    envelopeAssociatedDataHex: toHex(
      encodeDeviceEnvelopeAssociatedData(
        context,
        { recipientActorId: 'bob', recipientDeviceId: 'bob-device' },
        transcript.logicalMessageId,
        commitment,
      ),
    ),
    transcript: {
      ...transcript,
      commitmentHex: toHex(transcript.commitment),
      commitment: undefined,
      recipientFanoutDigestHex: toHex(transcript.recipientFanoutDigest),
      recipientFanoutDigest: undefined,
      ciphertextDigestsHex: transcript.ciphertextDigests.map(toHex),
      ciphertextDigests: undefined,
    },
    nodeReportTagHex: toHex(tag),
  });
}

/**
 * A full seal/open round trip through the ADR 0025 envelope construction, so a second
 * implementation can confirm it produces byte-identical associated data, inner plaintext, and
 * ciphertext rather than merely "a ciphertext the reference implementation also accepts".
 */
function generateDeviceEnvelopeVector(): void {
  const seed = 303;
  const { aliceState, bobState } = establishedRatchetPair(seed);
  const context: FrankingCommitmentContext = {
    frankingProfile: 'patches-franking-v1',
    conversationId: 'vector-conversation',
    membershipEpoch: 1,
    senderActorId: 'alice',
    senderDeviceId: 'alice-device',
  };
  const recipient = { recipientActorId: 'bob', recipientDeviceId: 'bob-device' };
  const logicalMessageId = 'vector-message-1';
  const openingKey = sha256Hash(encoder.encode('vector-envelope-opening-key'));
  const plaintext = encoder.encode('vector sealed envelope body');
  const commitment = commitFranking(openingKey, context, plaintext);
  const sealed = sealDeviceEnvelope(
    aliceState,
    { context, recipient, logicalMessageId, plaintext, openingKey, commitment },
    deterministicSource(seed),
  );
  const opened = openDeviceEnvelope(
    bobState,
    { context, recipient, logicalMessageId, message: sealed.output, commitment },
    deterministicSource(seed + 1),
  );
  if (toHex(opened.output.openingKey) !== toHex(openingKey)) {
    throw new Error('Device-envelope vector did not round-trip its opening key.');
  }

  writeJson('device-envelope.json', {
    description:
      'ADR 0025 device envelope (as amended by the 2026-08 audit hardening: the associated ' +
      'data also binds the logical message id): the franking opening travels in the inner ' +
      'authenticated plaintext and the commitment is the body AEAD associated data. Replayed by ' +
      'src/vectors.test.ts.',
    seed,
    context,
    recipient,
    logicalMessageId,
    openingKeyHex: toHex(openingKey),
    plaintextUtf8: 'vector sealed envelope body',
    commitmentHex: toHex(commitment),
    associatedDataHex: toHex(
      encodeDeviceEnvelopeAssociatedData(context, recipient, logicalMessageId, commitment),
    ),
    encryptedHeaderHex: toHex(sealed.output.encryptedHeader),
    ciphertextHex: toHex(sealed.output.ciphertext),
  });
}

/**
 * ADR 0037 §1: a fixed device-link offer, its device signature, the SAS derived from its bytes,
 * and hex inputs a conforming decoder/verifier must reject.
 */
function generateDeviceLinkVector(): void {
  const seed = 606;
  const deviceSigning = signingKeyPairFromPrivate(fixtureBytes(seed));
  const deviceAgreement = keyAgreementKeyPairFromPrivate(fixtureBytes(seed + 1));
  const createdAtMs = 1_700_000_000_000;
  const expiresAtMs = createdAtMs + 600_000;

  const offerFields: DeviceLinkOfferFields = {
    actorId: 'actor-vector',
    deviceId: 'device-vector-link',
    signingPublicKey: deviceSigning.publicKey,
    agreementPublicKey: deviceAgreement.publicKey,
    supportedProtocolVersions: [E2EE_PROTOCOL],
    createdAtMs,
    expiresAtMs,
  };
  const signed = signDeviceLinkOffer(deviceSigning.privateKey, offerFields);
  // Verified here only to prove the fixture round-trips before it is committed; the recorded
  // vector itself is replayed from the raw bytes by `src/vectors.test.ts`.
  verifyDeviceLinkOffer({
    offerBytes: signed.offerBytes,
    deviceSignature: signed.deviceSignature,
    nowMs: createdAtMs + 1_000,
  });
  const sas = deviceLinkSas(signed.offerBytes, offerFields.actorId);

  const domainByteLength = encoder.encode('patches-e2ee-v1/device-link-offer').length;
  const versionOffset = 4 + domainByteLength;
  const tamperedSignature = signed.deviceSignature.slice();
  tamperedSignature[0] = (tamperedSignature[0] ?? 0) ^ 0xff;
  const trailing = new Uint8Array(signed.offerBytes.length + 1);
  trailing.set(signed.offerBytes, 0);
  const wrongVersion = signed.offerBytes.slice();
  wrongVersion[versionOffset] = 2;

  writeJson('device-link.json', {
    description:
      'ADR 0037 §1 device-link offer transcript for a single fixed seed: the offer fields, ' +
      'transcript bytes, device signature, and derived SAS — plus hex/signature inputs a ' +
      'conforming verifier must reject. Replayed by src/vectors.test.ts.',
    seed,
    keys: {
      deviceSigningPrivateKeyHex: toHex(deviceSigning.privateKey),
      deviceSigningPublicKeyHex: toHex(deviceSigning.publicKey),
      deviceAgreementPublicKeyHex: toHex(deviceAgreement.publicKey),
    },
    offer: {
      fields: {
        actorId: offerFields.actorId,
        deviceId: offerFields.deviceId,
        signingPublicKeyHex: toHex(offerFields.signingPublicKey),
        agreementPublicKeyHex: toHex(offerFields.agreementPublicKey),
        supportedProtocolVersions: offerFields.supportedProtocolVersions,
        createdAtMs: offerFields.createdAtMs,
        expiresAtMs: offerFields.expiresAtMs,
      },
      transcriptHex: toHex(signed.offerBytes),
      deviceSignatureHex: toHex(signed.deviceSignature),
      verifiedAtMs: createdAtMs + 1_000,
    },
    sas: {
      actorId: offerFields.actorId,
      value: sas,
    },
    rejected: [
      {
        name: 'tampered signature',
        offerHex: toHex(signed.offerBytes),
        signatureHex: toHex(tamperedSignature),
        nowMs: createdAtMs + 1_000,
      },
      {
        name: 'expired offer',
        offerHex: toHex(signed.offerBytes),
        signatureHex: toHex(signed.deviceSignature),
        nowMs: expiresAtMs,
      },
      {
        name: 'trailing bytes',
        offerHex: toHex(trailing),
        signatureHex: toHex(signed.deviceSignature),
        nowMs: createdAtMs + 1_000,
      },
      {
        name: 'wrong version',
        offerHex: toHex(wrongVersion),
        signatureHex: toHex(signed.deviceSignature),
        nowMs: createdAtMs + 1_000,
      },
    ],
  });
}

generateIdentityTranscriptsVector();
generateX3dhVector();
generateDoubleRatchetVector();
generateFrankingVector();
generateDeviceEnvelopeVector();
generateDeviceLinkVector();
process.stdout.write(
  'Wrote src/vectors/{identity-transcripts,x3dh-handshake,double-ratchet-session,franking,' +
    'device-envelope,device-link}.json\n',
);
