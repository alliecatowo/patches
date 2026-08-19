import { describe, expect, it } from 'vitest';

import { toHex } from './codec.js';
import { certifyDevice, createSignedPreKey, rosterDigest, signDeviceRoster } from './identity.js';
import { keyAgreementKeyPairFromPrivate, signingKeyPairFromPrivate } from './primitives.js';
import {
  initializeInitiatorRatchet,
  initializeResponderRatchet,
  ratchetDecrypt,
  ratchetEncrypt,
} from './ratchet.js';
import {
  E2EE_PROTOCOL,
  E2EE_VERSION,
  MAX_SKIP,
  type CertifiedDevice,
  type DevicePrivateKeys,
  type DeviceRoster,
  type EncryptedRatchetMessage,
  type KeyPair,
  type PreKeyBundle,
  type PrivatePreKey,
  type RatchetRandomSource,
  type SignedDeviceRoster,
} from './types.js';
import { initiateX3dh, respondX3dh } from './x3dh.js';

const NOW = 10_000;
const encoder = new TextEncoder();

function bytes(value: number): Uint8Array {
  return new Uint8Array(32).fill(value);
}

interface UserFixture {
  readonly root: KeyPair;
  readonly keys: DevicePrivateKeys;
  readonly device: CertifiedDevice;
  readonly roster: SignedDeviceRoster;
}

function userFixture(userId: string, seed: number): UserFixture {
  const root = signingKeyPairFromPrivate(bytes(seed));
  const signing = signingKeyPairFromPrivate(bytes(seed + 1));
  const agreement = keyAgreementKeyPairFromPrivate(bytes(seed + 2));
  const device = certifyDevice(root.privateKey, {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    userId,
    deviceId: `${userId}-device`,
    signingPublicKey: signing.publicKey,
    agreementPublicKey: agreement.publicKey,
    generation: 1,
    createdAtMs: 1,
    expiresAtMs: 1_000_000,
  });
  const rosterValue: DeviceRoster = {
    protocol: E2EE_PROTOCOL,
    version: E2EE_VERSION,
    userId,
    rootPublicKey: root.publicKey,
    sequence: 1,
    previousDigest: new Uint8Array(32),
    devices: [device],
    createdAtMs: 1,
  };
  return {
    root,
    keys: { signing, agreement },
    device,
    roster: signDeviceRoster(root.privateKey, rosterValue),
  };
}

function bundleFixture(
  user: UserFixture,
  seed: number,
): { bundle: PreKeyBundle; signedPreKey: PrivatePreKey; oneTimePreKey: PrivatePreKey } {
  const signedPreKey = { id: 71, keyPair: keyAgreementKeyPairFromPrivate(bytes(seed)) };
  const oneTimePreKey = { id: 91, keyPair: keyAgreementKeyPairFromPrivate(bytes(seed + 1)) };
  const digest = rosterDigest(user.roster.roster);
  return {
    signedPreKey,
    oneTimePreKey,
    bundle: {
      protocol: E2EE_PROTOCOL,
      version: E2EE_VERSION,
      certifiedDevice: user.device,
      rosterDigest: digest,
      signedPreKey: createSignedPreKey(user.keys.signing.privateKey, user.device, digest, {
        id: signedPreKey.id,
        publicKey: signedPreKey.keyPair.publicKey,
        createdAtMs: 1,
        expiresAtMs: 20_000,
      }),
      oneTimePreKey: { id: oneTimePreKey.id, publicKey: oneTimePreKey.keyPair.publicKey },
    },
  };
}

function deterministicSource(seed: number): RatchetRandomSource {
  let counter = 0;
  return {
    randomBytes(length: number): Uint8Array {
      counter += 1;
      return new Uint8Array(length).fill((seed + counter) & 0xff);
    },
    generateKeyAgreementKeyPair(): KeyPair {
      counter += 1;
      return keyAgreementKeyPairFromPrivate(bytes((seed + counter) & 0xff));
    },
  };
}

function establishedFixture() {
  const alice = userFixture('alice', 1);
  const bob = userFixture('bob', 10);
  const bobPrekeys = bundleFixture(bob, 20);
  const initiated = initiateX3dh({
    initiatorKeys: alice.keys,
    initiatorDevice: alice.device,
    initiatorRoster: alice.roster,
    responderBundle: bobPrekeys.bundle,
    responderRoster: bob.roster,
    nowMs: NOW,
    ephemeralKey: keyAgreementKeyPairFromPrivate(bytes(30)),
  });
  const responded = respondX3dh({
    responderKeys: bob.keys,
    responderBundle: bobPrekeys.bundle,
    responderRoster: bob.roster,
    initiatorRoster: alice.roster,
    signedPreKey: bobPrekeys.signedPreKey,
    oneTimePreKey: bobPrekeys.oneTimePreKey,
    handshake: initiated.handshake,
    nowMs: NOW,
  });
  return { alice, bob, bobPrekeys, initiated, responded };
}

describe('transcript-bound X3DH', () => {
  it('derives identical setup secrets and binds every certified identity', () => {
    const fixture = establishedFixture();
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
        nowMs: NOW,
      }),
    ).toThrow('Cryptographic authentication failed.');
  });
});

describe('revision-4 Double Ratchet with encrypted headers', () => {
  it('ratchets both DH directions and produces a stable generated transcript vector', () => {
    const fixture = establishedFixture();
    let aliceState = initializeInitiatorRatchet(
      fixture.initiated.secrets,
      fixture.initiated.initiatorRatchetKey,
      fixture.bobPrekeys.signedPreKey.keyPair.publicKey,
    );
    let bobState = initializeResponderRatchet(
      fixture.responded.secrets,
      fixture.responded.responderRatchetKey,
    );
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
    expect(toHex(first.output.ciphertext)).toBe('159134cc866fe5fe2389ea4db2bf8fd686907bbedb');
  });

  it('handles bounded out-of-order delivery and rejects replay', () => {
    const fixture = establishedFixture();
    let aliceState = initializeInitiatorRatchet(
      fixture.initiated.secrets,
      fixture.initiated.initiatorRatchetKey,
      fixture.bobPrekeys.signedPreKey.keyPair.publicKey,
    );
    let bobState = initializeResponderRatchet(
      fixture.responded.secrets,
      fixture.responded.responderRatchetKey,
    );
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

  it('property-checks shuffled delivery across deterministic generated transcripts', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const fixture = establishedFixture();
      let sender = initializeInitiatorRatchet(
        fixture.initiated.secrets,
        fixture.initiated.initiatorRatchetKey,
        fixture.bobPrekeys.signedPreKey.keyPair.publicKey,
      );
      let receiver = initializeResponderRatchet(
        fixture.responded.secrets,
        fixture.responded.responderRatchetKey,
      );
      const ad = encoder.encode(`property-${String(seed)}`);
      const messages: Array<{ index: number; encrypted: EncryptedRatchetMessage }> = [];
      for (let index = 0; index < 24; index += 1) {
        const encrypted = ratchetEncrypt(
          sender,
          encoder.encode(`${String(seed)}:${String(index)}`),
          ad,
          deterministicSource(seed * 17 + index),
        );
        sender = encrypted.state;
        messages.push({ index, encrypted: encrypted.output });
      }
      let random = seed;
      for (let index = messages.length - 1; index > 0; index -= 1) {
        random = (random * 1_664_525 + 1_013_904_223) >>> 0;
        const swapIndex = random % (index + 1);
        const current = messages[index];
        const swap = messages[swapIndex];
        if (current === undefined || swap === undefined) throw new Error('Shuffle failed.');
        messages[index] = swap;
        messages[swapIndex] = current;
      }
      for (const message of messages) {
        const opened = ratchetDecrypt(
          receiver,
          message.encrypted,
          ad,
          deterministicSource(seed * 31),
        );
        receiver = opened.state;
        expect(new TextDecoder().decode(opened.output)).toBe(
          `${String(seed)}:${String(message.index)}`,
        );
      }
    }
  });

  it('does not advance caller state when authentication fails and enforces the skip bound', () => {
    const fixture = establishedFixture();
    const aliceState = initializeInitiatorRatchet(
      fixture.initiated.secrets,
      fixture.initiated.initiatorRatchetKey,
      fixture.bobPrekeys.signedPreKey.keyPair.publicKey,
    );
    const bobState = initializeResponderRatchet(
      fixture.responded.secrets,
      fixture.responded.responderRatchetKey,
    );
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
});
