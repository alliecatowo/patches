import { describe, expect, it } from 'vitest';

import {
  decodeRatchetState,
  encodeRatchetState,
  ratchetDecrypt,
  ratchetEncrypt,
} from './double-ratchet.js';
import { toHex } from './codec.js';
import { deterministicSource, establishedRatchetPair } from './testing/fixtures.js';
import { MAX_SKIP, type EncryptedRatchetMessage } from './types.js';
import { respondX3dh } from './x3dh.js';

const encoder = new TextEncoder();

describe('transcript-bound X3DH', () => {
  it('derives identical setup secrets and binds every certified identity', () => {
    const { fixture } = establishedRatchetPair(1);
    expect(fixture.responded.secrets).toEqual(fixture.initiated.secrets);
    expect(fixture.responded.consumedOneTimePreKeyId).toBe(91);

    const signature = fixture.initiated.handshake.initiatorSignature.slice();
    signature[0] = (signature[0] ?? 0) ^ 1;
    expect(() =>
      respondX3dh({
        responderKeys: fixture.bob.keys,
        responderBundle: fixture.bobPrekeys.bundle,
        responderRoster: fixture.bob.roster,
        initiatorRoster: fixture.alice.roster,
        signedPreKey: fixture.bobPrekeys.signedPreKey,
        oneTimePreKey: fixture.bobPrekeys.oneTimePreKey,
        handshake: { ...fixture.initiated.handshake, initiatorSignature: signature },
        nowMs: 10_000,
      }),
    ).toThrow('Cryptographic authentication failed.');
  });
});

describe('revision-4 Double Ratchet with encrypted headers', () => {
  it('ratchets both DH directions and produces a stable generated transcript vector', () => {
    const { aliceState: initialAlice, bobState: initialBob } = establishedRatchetPair(1);
    let aliceState = initialAlice;
    let bobState = initialBob;
    const aliceSource = deterministicSource(40);
    const bobSource = deterministicSource(80);
    const ad = encoder.encode('conversation-1/device-pair-a-b');

    const first = ratchetEncrypt(aliceState, encoder.encode('hello'), ad, aliceSource);
    aliceState = first.state;
    const openedFirst = ratchetDecrypt(bobState, first.output, ad, bobSource);
    bobState = openedFirst.state;
    expect(new TextDecoder().decode(openedFirst.output)).toBe('hello');

    const reply = ratchetEncrypt(bobState, encoder.encode('world'), ad, bobSource);
    bobState = reply.state;
    const openedReply = ratchetDecrypt(aliceState, reply.output, ad, aliceSource);
    aliceState = openedReply.state;
    expect(new TextDecoder().decode(openedReply.output)).toBe('world');
    expect(aliceState.receivingChainKey).toEqual(bobState.sendingChainKey);
    expect(aliceState.receivingRatchetPublicKey).toEqual(bobState.sendingRatchetKey.publicKey);

    expect(toHex(first.output.encryptedHeader)).toHaveLength(162);
    expect(toHex(first.output.ciphertext)).toBe('0719a473292479e5b2a3053f8812c0629cac27b3fe');
  });

  it('handles bounded out-of-order delivery and rejects replay', () => {
    const { aliceState: initialAlice, bobState: initialBob } = establishedRatchetPair(1);
    let aliceState = initialAlice;
    let bobState = initialBob;
    const source = deterministicSource(50);
    const receiverSource = deterministicSource(90);
    const ad = encoder.encode('pair');
    const sent = [];
    for (let index = 0; index < 40; index += 1) {
      const encrypted = ratchetEncrypt(
        aliceState,
        encoder.encode(`message-${String(index)}`),
        ad,
        source,
      );
      aliceState = encrypted.state;
      sent.push(encrypted.output);
    }
    for (let index = sent.length - 1; index >= 0; index -= 1) {
      const message = sent[index];
      if (message === undefined) throw new Error('Test fixture message missing.');
      const opened = ratchetDecrypt(bobState, message, ad, receiverSource);
      bobState = opened.state;
      expect(new TextDecoder().decode(opened.output)).toBe(`message-${String(index)}`);
    }
    const first = sent[0];
    if (first === undefined) throw new Error('Test fixture message missing.');
    expect(() => ratchetDecrypt(bobState, first, ad, receiverSource)).toThrow();
  });

  it('does not advance caller state when authentication fails and enforces the skip bound', () => {
    const { aliceState, bobState } = establishedRatchetPair(1);
    const ad = encoder.encode('pair');
    const source = deterministicSource(60);
    const encrypted = ratchetEncrypt(aliceState, encoder.encode('body'), ad, source);
    const forgedCiphertext = encrypted.output.ciphertext.slice();
    forgedCiphertext[0] = (forgedCiphertext[0] ?? 0) ^ 1;
    const rootBefore = bobState.rootKey.slice();
    expect(() =>
      ratchetDecrypt(
        bobState,
        { ...encrypted.output, ciphertext: forgedCiphertext },
        ad,
        deterministicSource(70),
      ),
    ).toThrow('Cryptographic authentication failed.');
    expect(bobState.rootKey).toEqual(rootBefore);
    expect(bobState.receivedCount).toBe(0);

    let sender = encrypted.state;
    let farMessage = encrypted.output;
    for (let index = 0; index <= MAX_SKIP; index += 1) {
      const next = ratchetEncrypt(sender, encoder.encode('x'), ad, source);
      sender = next.state;
      farMessage = next.output;
    }
    expect(() => ratchetDecrypt(bobState, farMessage, ad, deterministicSource(70))).toThrow(
      'Gap too large.',
    );
  });

  it('round-trips explicit versioned state serialization without losing counters or keys', () => {
    const { aliceState, bobState } = establishedRatchetPair(2);
    const ad = encoder.encode('serialize-pair');
    const source = deterministicSource(15);
    const receiverSource = deterministicSource(25);
    const first = ratchetEncrypt(aliceState, encoder.encode('persisted'), ad, source);
    const opened = ratchetDecrypt(bobState, first.output, ad, receiverSource);

    const encodedAlice = encodeRatchetState(first.state);
    const decodedAlice = decodeRatchetState(encodedAlice);
    expect(decodedAlice).toEqual(first.state);
    expect(encodeRatchetState(decodedAlice)).toEqual(encodedAlice);

    const encodedBob = encodeRatchetState(opened.state);
    expect(decodeRatchetState(encodedBob)).toEqual(opened.state);

    expect(() => decodeRatchetState(new Uint8Array([9, ...encodedAlice.slice(1)]))).toThrow(
      'Unsupported ratchet state format version.',
    );
    expect(() => decodeRatchetState(encodedAlice.slice(0, encodedAlice.length - 1))).toThrow();
  });

  it('preserves skipped-message keys across a serialization round trip and still decrypts them', () => {
    const { aliceState, bobState } = establishedRatchetPair(3);
    const ad = encoder.encode('skip-pair');
    const source = deterministicSource(5);
    const receiverSource = deterministicSource(6);
    let sender = aliceState;
    const sent: EncryptedRatchetMessage[] = [];
    for (let index = 0; index < 5; index += 1) {
      const encrypted = ratchetEncrypt(sender, encoder.encode(`m${String(index)}`), ad, source);
      sender = encrypted.state;
      sent.push(encrypted.output);
    }
    const message4 = sent[4];
    if (message4 === undefined) throw new Error('fixture');
    const opened = ratchetDecrypt(bobState, message4, ad, receiverSource);
    expect(opened.state.skippedMessageKeys.size).toBe(4);

    const restored = decodeRatchetState(encodeRatchetState(opened.state));
    const message0 = sent[0];
    if (message0 === undefined) throw new Error('fixture');
    const openedSkipped = ratchetDecrypt(restored, message0, ad, receiverSource);
    expect(new TextDecoder().decode(openedSkipped.output)).toBe('m0');
    expect(openedSkipped.state.skippedMessageKeys.size).toBe(3);
  });
});
