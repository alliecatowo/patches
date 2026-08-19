import { describe, expect, it } from 'vitest';

import { fromHex, toHex } from './codec.js';
import {
  decodeRatchetState,
  encodeRatchetState,
  ratchetDecrypt,
  ratchetEncrypt,
} from './double-ratchet.js';
import { commitFranking, createNodeReportTag, type FrankingReportTranscript } from './franking.js';
import {
  deterministicSource,
  establishedFixture,
  establishedRatchetPair,
} from './testing/fixtures.js';
import type { DoubleRatchetState, EncryptedRatchetMessage } from './types.js';
import doubleRatchetVector from './vectors/double-ratchet-session.json' with { type: 'json' };
import frankingVector from './vectors/franking.json' with { type: 'json' };
import x3dhVector from './vectors/x3dh-handshake.json' with { type: 'json' };

const encoder = new TextEncoder();

/**
 * These tests recompute every vector from its recorded `seed`/inputs using the current
 * implementation and assert byte-for-byte equality with the checked-in JSON. A failure here
 * means either an unintentional protocol regression (fix the code) or a deliberate change (run
 * `pnpm exec tsx packages/crypto/scripts/generate-vectors.ts` and review the resulting diff).
 */
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
    const commitment = commitFranking(openingKey, plaintext);
    expect(toHex(commitment)).toBe(frankingVector.commitmentHex);

    const transcript: FrankingReportTranscript = {
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
