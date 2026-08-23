import { describe, expect, it } from 'vitest';

import { ByteWriter, concatBytes, toHex } from './codec.js';
import {
  decodeRatchetState,
  encodeRatchetState,
  initializeResponderRatchet,
  ratchetDecrypt,
  ratchetEncrypt,
} from './double-ratchet.js';
import { deterministicSource, establishedRatchetPair, fixtureBytes } from './testing/fixtures.js';
import { RatchetStateError, TooManySkippedMessagesError } from './errors.js';
import {
  MAX_SKIPPED_KEYS,
  KEY_BYTES,
  type EncryptedRatchetMessage,
  type X3dhSecrets,
} from './types.js';
import { disposeX3dhSecrets, respondX3dh } from './x3dh.js';

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
    // `encrypted` is message number 0; this loop adds numbers 1..MAX_SKIPPED_KEYS, so the far
    // delivery leaves a gap of exactly MAX_SKIPPED_KEYS — the largest the cache can absorb.
    for (let index = 0; index < MAX_SKIPPED_KEYS; index += 1) {
      const next = ratchetEncrypt(sender, encoder.encode('x'), ad, source);
      sender = next.state;
      farMessage = next.output;
    }
    // Regression (2026-08 audit): a first delivery one past the retired per-gap cap used to
    // throw before storing anything, permanently bricking the chain. Within the cache bound the
    // gap is now absorbed: the far message decrypts, everything skipped stays recoverable, and
    // the session keeps working in both directions.
    const opened = ratchetDecrypt(bobState, farMessage, ad, deterministicSource(70));
    expect(new TextDecoder().decode(opened.output)).toBe('x');
    expect(opened.state.skippedMessageKeys.size).toBe(MAX_SKIPPED_KEYS);

    // The retained window still decrypts late deliveries out of order (via the skipped-key
    // cache, ahead of the receive counter).
    let sender2 = encrypted.state;
    let midMessage = encrypted.output;
    for (let index = 0; index < MAX_SKIPPED_KEYS / 2; index += 1) {
      const next = ratchetEncrypt(sender2, encoder.encode(`mid-${String(index)}`), ad, source);
      sender2 = next.state;
      midMessage = next.output;
    }
    const openedMid = ratchetDecrypt(opened.state, midMessage, ad, deterministicSource(70));
    expect(new TextDecoder().decode(openedMid.output)).toBe(
      `mid-${String(MAX_SKIPPED_KEYS / 2 - 1)}`,
    );

    // And a full reply round trip — which DH-ratchets both sides — still works afterwards.
    const reply = ratchetEncrypt(
      openedMid.state,
      encoder.encode('reply'),
      ad,
      deterministicSource(71),
    );
    const openedReply = ratchetDecrypt(sender2, reply.output, ad, deterministicSource(72));
    const nextSend = ratchetEncrypt(
      openedReply.state,
      encoder.encode('after-recovery'),
      ad,
      deterministicSource(73),
    );
    const openedAfter = ratchetDecrypt(
      openedMid.state,
      nextSend.output,
      ad,
      deterministicSource(74),
    );
    expect(new TextDecoder().decode(openedAfter.output)).toBe('after-recovery');
  });

  it('refuses a gap beyond the cache bound per-message and recovers through a DH ratchet', () => {
    const { aliceState, bobState } = establishedRatchetPair(4);
    const ad = encoder.encode('brick-pair');
    const source = deterministicSource(60);
    // Message 0 arrives normally; it is also what arms bob's sending chain (a responder's first
    // receive runs the DH ratchet).
    const first = ratchetEncrypt(aliceState, encoder.encode('m0'), ad, source);
    const armedBob = ratchetDecrypt(bobState, first.output, ad, deterministicSource(61)).state;
    // Then alice sends MAX_SKIPPED_KEYS + 2 more without any of them being delivered: delivering
    // the last leaves a gap of MAX_SKIPPED_KEYS + 1 missed keys, which can never fit the cache.
    let sender = first.state;
    let tooFar: EncryptedRatchetMessage | undefined;
    for (let index = 0; index <= MAX_SKIPPED_KEYS + 1; index += 1) {
      const next = ratchetEncrypt(sender, encoder.encode(`m${String(index + 1)}`), ad, source);
      sender = next.state;
      tooFar = next.output;
    }
    if (tooFar === undefined) throw new Error('fixture');

    // Per-message refusal: this delivery throws and the state is untouched...
    expect(() => ratchetDecrypt(armedBob, tooFar, ad, deterministicSource(70))).toThrow(
      TooManySkippedMessagesError,
    );
    expect(armedBob.receivedCount).toBe(1);
    expect(armedBob.skippedMessageKeys.size).toBe(0);

    // ...but the chain is not bricked: bob replies, alice DH-ratchets, and her next send under
    // the new ratchet key arrives carrying `previousChainLength` past every bound. Before the
    // fix that pre-ratchet skip threw and the session was unrecoverable.
    const reply = ratchetEncrypt(armedBob, encoder.encode('rescue'), ad, deterministicSource(80));
    const aliceTurn = ratchetDecrypt(sender, reply.output, ad, deterministicSource(81));
    const rescueMessage = ratchetEncrypt(
      aliceTurn.state,
      encoder.encode('after-the-flood'),
      ad,
      deterministicSource(82),
    );
    const rescued = ratchetDecrypt(armedBob, rescueMessage.output, ad, deterministicSource(83));
    expect(new TextDecoder().decode(rescued.output)).toBe('after-the-flood');

    // The recovered session keeps working in both directions.
    const ack = ratchetEncrypt(rescued.state, encoder.encode('ack'), ad, deterministicSource(84));
    const acked = ratchetDecrypt(aliceTurn.state, ack.output, ad, deterministicSource(85));
    expect(new TextDecoder().decode(acked.output)).toBe('ack');
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

  /**
   * Regression (2026-08 audit): two serialized entries with the same `(header key, message
   * number)` id used to collapse silently via `Map#set`, shrinking the restored cache below the
   * declared count and leaving the vault entry inconsistent with the session it restores.
   */
  it('rejects a serialized skipped-key section whose ids are not unique', () => {
    // A structurally minimal responder state (every optional key absent) so the fixed layout is
    // easy to synthesize: version, root/send pub/send priv, five presence flags, two header
    // keys, three u32 counters, then the skipped-key count and entries.
    const secrets: X3dhSecrets = {
      rootKey: fixtureBytes(1),
      initiatorHeaderKey: fixtureBytes(2),
      responderHeaderKey: fixtureBytes(3),
    };
    const state = initializeResponderRatchet(secrets, {
      publicKey: fixtureBytes(4),
      privateKey: fixtureBytes(5),
    });
    const valid = encodeRatchetState(state);
    expect(decodeRatchetState(valid).skippedMessageKeys.size).toBe(0);

    const entry = (messageNumber: number): Uint8Array =>
      new ByteWriter()
        .fixed(fixtureBytes(9), KEY_BYTES)
        .u32(messageNumber)
        .fixed(fixtureBytes(10), KEY_BYTES)
        .finish();

    // Rebuild the buffer: same prefix with the count field replaced, then the identical entry
    // twice. Raw concatenation, because `ByteWriter#bytes` would add a length prefix the state
    // format does not have.
    const countField = (value: number): Uint8Array => {
      const bytes = new Uint8Array(4);
      new DataView(bytes.buffer).setUint32(0, value, false);
      return bytes;
    };
    const prefix = valid.subarray(0, valid.length - 4);
    const corrupt = concatBytes(prefix, countField(2), entry(7), entry(7));
    expect(() => decodeRatchetState(corrupt)).toThrow(RatchetStateError);
    expect(() => decodeRatchetState(corrupt)).toThrow(
      'Serialized skipped-key entries contain a duplicate id.',
    );

    // The distinct-entry control decodes fine and preserves the declared count.
    const healthy = concatBytes(prefix, countField(2), entry(7), entry(8));
    expect(decodeRatchetState(healthy).skippedMessageKeys.size).toBe(2);
  });
});

describe('disposeX3dhSecrets', () => {
  it('zeroizes every X3DH secret and the ephemeral key pair in place', () => {
    const secrets: X3dhSecrets = {
      rootKey: fixtureBytes(11),
      initiatorHeaderKey: fixtureBytes(12),
      responderHeaderKey: fixtureBytes(13),
    };
    const ephemeral = { publicKey: fixtureBytes(14), privateKey: fixtureBytes(15) };
    disposeX3dhSecrets(secrets, ephemeral);
    for (const buffer of [
      secrets.rootKey,
      secrets.initiatorHeaderKey,
      secrets.responderHeaderKey,
      ephemeral.publicKey,
      ephemeral.privateKey,
    ]) {
      expect(buffer.every((byte) => byte === 0)).toBe(true);
    }
  });

  it('zeroizes the secrets alone when called without an ephemeral pair', () => {
    const secrets: X3dhSecrets = {
      rootKey: fixtureBytes(21),
      initiatorHeaderKey: fixtureBytes(22),
      responderHeaderKey: fixtureBytes(23),
    };
    disposeX3dhSecrets(secrets);
    for (const buffer of [
      secrets.rootKey,
      secrets.initiatorHeaderKey,
      secrets.responderHeaderKey,
    ]) {
      expect(buffer.every((byte) => byte === 0)).toBe(true);
    }
  });
});
