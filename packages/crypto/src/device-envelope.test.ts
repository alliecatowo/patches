import { describe, expect, it } from 'vitest';

import { toHex } from './codec.js';
import {
  encodeDeviceEnvelopeAssociatedData,
  openDeviceEnvelope,
  sealDeviceEnvelope,
  type DeviceEnvelopeRecipient,
} from './device-envelope.js';
import { ratchetEncrypt } from './double-ratchet.js';
import { AuthenticationError, FrankingError } from './errors.js';
import {
  commitFranking,
  createFrankingOpeningKey,
  type FrankingCommitmentContext,
} from './franking.js';
import { deterministicSource, establishedRatchetPair } from './testing/fixtures.js';
import type { DoubleRatchetState } from './types.js';

const encoder = new TextEncoder();

const CONTEXT: FrankingCommitmentContext = {
  frankingProfile: 'patches-franking-v1',
  conversationId: 'conversation-1',
  membershipEpoch: 1,
  senderActorId: 'alice',
  senderDeviceId: 'alice-device',
};

const BOB: DeviceEnvelopeRecipient = {
  recipientActorId: 'bob',
  recipientDeviceId: 'bob-device',
};

function pair(seed = 909): { alice: DoubleRatchetState; bob: DoubleRatchetState } {
  const established = establishedRatchetPair(seed);
  return { alice: established.aliceState, bob: established.bobState };
}

describe('sealDeviceEnvelope / openDeviceEnvelope', () => {
  it('round-trips a plaintext and its franking opening', () => {
    const { alice, bob } = pair();
    const plaintext = encoder.encode('hello bob');
    const opening = createFrankingOpeningKey();
    const commitment = commitFranking(opening, CONTEXT, plaintext);

    const sealed = sealDeviceEnvelope(
      alice,
      { context: CONTEXT, recipient: BOB, plaintext, openingKey: opening, commitment },
      deterministicSource(7),
    );
    const opened = openDeviceEnvelope(
      bob,
      { context: CONTEXT, recipient: BOB, message: sealed.output, commitment },
      deterministicSource(8),
    );

    expect(opened.output.plaintext).toEqual(plaintext);
    expect(toHex(opened.output.openingKey)).toEqual(toHex(opening));
  });

  /**
   * **The adversarial case this whole change exists for (ADR 0024 B-045, ADR 0025).**
   *
   * A sender encrypts real abuse honestly to every recipient device and declares 32 unrelated
   * bytes as the franking commitment. Before ADR 0025 this worked perfectly: the node
   * length-checked the commitment and stored it, the recipient decrypted and displayed the
   * message, and the victim's later report came back `COMMITMENT_MISMATCH` — indistinguishable
   * from a fabricated report. That is deterministic, zero-cost repudiation of any message.
   *
   * There is no path here that reaches a plaintext. The sender cannot even build the envelope
   * (`sealDeviceEnvelope` re-derives the commitment), and if it hand-rolls the ratchet call to
   * get around that, the recipient's `openDeviceEnvelope` either fails to authenticate — because
   * the commitment is associated data — or fails the franking check, and in neither case is the
   * decrypted plaintext returned.
   */
  describe('a sender whose commitment is unrelated to what it encrypted', () => {
    const plaintext = encoder.encode('abusive content the sender wants to deny');
    const unrelatedCommitment = commitFranking(
      createFrankingOpeningKey(),
      CONTEXT,
      encoder.encode('something else entirely'),
    );

    it('cannot seal the envelope in the first place', () => {
      const { alice } = pair();
      const opening = createFrankingOpeningKey();
      expect(() =>
        sealDeviceEnvelope(
          alice,
          {
            context: CONTEXT,
            recipient: BOB,
            plaintext,
            openingKey: opening,
            commitment: unrelatedCommitment,
          },
          deterministicSource(7),
        ),
      ).toThrow(FrankingError);
    });

    it('is rejected by the recipient when it hand-rolls the ratchet to bypass the sender check', () => {
      const { alice, bob } = pair();
      const opening = createFrankingOpeningKey();
      // Exactly what `sealDeviceEnvelope` would produce, except the associated data commits to
      // the honest commitment while the sender will declare `unrelatedCommitment` to the node.
      const honestCommitment = commitFranking(opening, CONTEXT, plaintext);
      const hostile = ratchetEncrypt(
        alice,
        new Uint8Array([1, ...opening, 0, 0, 0, plaintext.length, ...plaintext]),
        encodeDeviceEnvelopeAssociatedData(CONTEXT, BOB, honestCommitment),
        deterministicSource(7),
      );

      expect(() =>
        openDeviceEnvelope(
          bob,
          {
            context: CONTEXT,
            recipient: BOB,
            message: hostile.output,
            commitment: unrelatedCommitment,
          },
          deterministicSource(8),
        ),
      ).toThrow(AuthenticationError);
    });

    it('is rejected by the recipient when it binds the bogus commitment consistently', () => {
      const { alice, bob } = pair();
      const opening = createFrankingOpeningKey();
      // The sender is fully consistent this time: the bogus commitment is the associated data
      // *and* what it declares to the node. AEAD is satisfied. Only the franking check is not.
      const hostile = ratchetEncrypt(
        alice,
        new Uint8Array([1, ...opening, 0, 0, 0, plaintext.length, ...plaintext]),
        encodeDeviceEnvelopeAssociatedData(CONTEXT, BOB, unrelatedCommitment),
        deterministicSource(7),
      );

      let thrown: unknown;
      try {
        openDeviceEnvelope(
          bob,
          {
            context: CONTEXT,
            recipient: BOB,
            message: hostile.output,
            commitment: unrelatedCommitment,
          },
          deterministicSource(8),
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(FrankingError);
      // §98/§101/§183.1: the failure must not carry the plaintext it just decrypted.
      expect((thrown as Error).message).not.toContain('abusive');
      expect((thrown as Error).message).toBe(
        'Message failed its franking check and was discarded.',
      );
    });
  });

  it('rejects an envelope the node redirected to a different recipient device', () => {
    const { alice, bob } = pair();
    const plaintext = encoder.encode('for bob only');
    const opening = createFrankingOpeningKey();
    const commitment = commitFranking(opening, CONTEXT, plaintext);
    const sealed = sealDeviceEnvelope(
      alice,
      { context: CONTEXT, recipient: BOB, plaintext, openingKey: opening, commitment },
      deterministicSource(7),
    );

    expect(() =>
      openDeviceEnvelope(
        bob,
        {
          context: CONTEXT,
          recipient: { recipientActorId: 'bob', recipientDeviceId: 'bob-other-device' },
          message: sealed.output,
          commitment,
        },
        deterministicSource(8),
      ),
    ).toThrow(AuthenticationError);
  });

  it('rejects an envelope whose delivered commitment the node substituted', () => {
    const { alice, bob } = pair();
    const plaintext = encoder.encode('unmodified');
    const opening = createFrankingOpeningKey();
    const commitment = commitFranking(opening, CONTEXT, plaintext);
    const sealed = sealDeviceEnvelope(
      alice,
      { context: CONTEXT, recipient: BOB, plaintext, openingKey: opening, commitment },
      deterministicSource(7),
    );
    const substituted = commitment.slice();
    substituted[0] = (substituted[0] ?? 0) ^ 0xff;

    expect(() =>
      openDeviceEnvelope(
        bob,
        { context: CONTEXT, recipient: BOB, message: sealed.output, commitment: substituted },
        deterministicSource(8),
      ),
    ).toThrow(AuthenticationError);
  });

  it('rejects an envelope replayed into a different conversation or epoch', () => {
    const { alice, bob } = pair();
    const plaintext = encoder.encode('context-bound');
    const opening = createFrankingOpeningKey();
    const commitment = commitFranking(opening, CONTEXT, plaintext);
    const sealed = sealDeviceEnvelope(
      alice,
      { context: CONTEXT, recipient: BOB, plaintext, openingKey: opening, commitment },
      deterministicSource(7),
    );

    for (const elsewhere of [
      { ...CONTEXT, conversationId: 'conversation-2' },
      { ...CONTEXT, membershipEpoch: 2 },
    ]) {
      expect(() =>
        openDeviceEnvelope(
          bob,
          { context: elsewhere, recipient: BOB, message: sealed.output, commitment },
          deterministicSource(8),
        ),
      ).toThrow(AuthenticationError);
    }
  });

  /**
   * ADR 0024's cheaper equivocation variant: one commitment per logical message, but each device
   * gets its own ciphertext, so a sender might try to show `P₁` to one device and `P₂` to
   * another. Both would have to open the same commitment, which is an HMAC-SHA256 collision at a
   * fixed 32-byte key width. This is the honest test of that: constructing the second envelope
   * is what fails, because no second opening exists.
   */
  it('cannot show two different plaintexts to two devices under one commitment', () => {
    const { alice } = pair();
    const opening = createFrankingOpeningKey();
    const first = encoder.encode('what device A is shown');
    const second = encoder.encode('what device B is shown');
    const commitment = commitFranking(opening, CONTEXT, first);

    for (const equivocatingOpening of [opening, createFrankingOpeningKey()]) {
      expect(() =>
        sealDeviceEnvelope(
          alice,
          {
            context: CONTEXT,
            recipient: { recipientActorId: 'bob', recipientDeviceId: 'bob-second-device' },
            plaintext: second,
            openingKey: equivocatingOpening,
            commitment,
          },
          deterministicSource(7),
        ),
      ).toThrow(FrankingError);
    }
  });

  it('refuses a commitment that is not 32 bytes on either side', () => {
    const { alice, bob } = pair();
    const plaintext = encoder.encode('x');
    const opening = createFrankingOpeningKey();
    const commitment = commitFranking(opening, CONTEXT, plaintext);
    const sealed = sealDeviceEnvelope(
      alice,
      { context: CONTEXT, recipient: BOB, plaintext, openingKey: opening, commitment },
      deterministicSource(7),
    );

    expect(() =>
      sealDeviceEnvelope(
        alice,
        {
          context: CONTEXT,
          recipient: BOB,
          plaintext,
          openingKey: opening,
          commitment: commitment.slice(0, 16),
        },
        deterministicSource(7),
      ),
    ).toThrow('Franking commitment has an invalid length.');
    expect(() =>
      openDeviceEnvelope(
        bob,
        {
          context: CONTEXT,
          recipient: BOB,
          message: sealed.output,
          commitment: new Uint8Array(64),
        },
        deterministicSource(8),
      ),
    ).toThrow('Franking commitment has an invalid length.');
  });
});

describe('encodeDeviceEnvelopeAssociatedData', () => {
  it('is domain-separated from the commitment transcript', () => {
    const commitment = commitFranking(createFrankingOpeningKey(), CONTEXT, encoder.encode('body'));
    const associatedData = encodeDeviceEnvelopeAssociatedData(CONTEXT, BOB, commitment);
    expect(new TextDecoder().decode(associatedData.subarray(4, 40))).toEqual(
      'patches-e2ee-v1/franking/envelope-ad',
    );
  });

  it('gives distinct bytes to recipient field splits that concatenate identically', () => {
    const commitment = commitFranking(createFrankingOpeningKey(), CONTEXT, encoder.encode('body'));
    const left = encodeDeviceEnvelopeAssociatedData(
      CONTEXT,
      { recipientActorId: 'ab', recipientDeviceId: 'c' },
      commitment,
    );
    const right = encodeDeviceEnvelopeAssociatedData(
      CONTEXT,
      { recipientActorId: 'a', recipientDeviceId: 'bc' },
      commitment,
    );
    expect(toHex(left)).not.toEqual(toHex(right));
  });
});
