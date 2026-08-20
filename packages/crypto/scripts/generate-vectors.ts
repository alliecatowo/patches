/**
 * One-off generator for `src/vectors/*.json`. Not part of the build or the verify pipeline —
 * regenerate deliberately (`pnpm exec tsx packages/crypto/scripts/generate-vectors.ts` from the
 * repo root) whenever a protocol change intentionally alters the wire bytes, and re-review the
 * diff. `src/vectors.test.ts` replays the checked-in JSON on every `pnpm test` run to catch
 * unintentional drift.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toHex } from '../src/codec.js';
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
    envelopeAssociatedDataHex: toHex(
      encodeDeviceEnvelopeAssociatedData(
        context,
        { recipientActorId: 'bob', recipientDeviceId: 'bob-device' },
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
  const openingKey = sha256Hash(encoder.encode('vector-envelope-opening-key'));
  const plaintext = encoder.encode('vector sealed envelope body');
  const commitment = commitFranking(openingKey, context, plaintext);
  const sealed = sealDeviceEnvelope(
    aliceState,
    { context, recipient, plaintext, openingKey, commitment },
    deterministicSource(seed),
  );
  const opened = openDeviceEnvelope(
    bobState,
    { context, recipient, message: sealed.output, commitment },
    deterministicSource(seed + 1),
  );
  if (toHex(opened.output.openingKey) !== toHex(openingKey)) {
    throw new Error('Device-envelope vector did not round-trip its opening key.');
  }

  writeJson('device-envelope.json', {
    description:
      'ADR 0025 device envelope: the franking opening travels in the inner authenticated ' +
      'plaintext and the commitment is the body AEAD associated data. Replayed by ' +
      'src/vectors.test.ts.',
    seed,
    context,
    recipient,
    openingKeyHex: toHex(openingKey),
    plaintextUtf8: 'vector sealed envelope body',
    commitmentHex: toHex(commitment),
    associatedDataHex: toHex(encodeDeviceEnvelopeAssociatedData(context, recipient, commitment)),
    encryptedHeaderHex: toHex(sealed.output.encryptedHeader),
    ciphertextHex: toHex(sealed.output.ciphertext),
  });
}

generateX3dhVector();
generateDoubleRatchetVector();
generateFrankingVector();
generateDeviceEnvelopeVector();
process.stdout.write(
  'Wrote src/vectors/{x3dh-handshake,double-ratchet-session,franking,device-envelope}.json\n',
);
