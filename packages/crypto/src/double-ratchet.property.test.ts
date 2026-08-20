import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ratchetDecrypt, ratchetEncrypt } from './double-ratchet.js';
import { E2eeProtocolError } from './errors.js';
import { deterministicSource, establishedRatchetPair } from './testing/fixtures.js';
import { MAX_SKIP, type DoubleRatchetState, type EncryptedRatchetMessage } from './types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface SentMessage {
  readonly plaintext: string;
  readonly encrypted: EncryptedRatchetMessage;
}

/** Fisher-Yates using fast-check's own PRNG-derived swap sequence, so shrinking stays reproducible. */
function shuffle<T>(items: readonly T[], swaps: readonly number[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = (swaps[index % swaps.length] ?? 0) % (index + 1);
    const current = result[index];
    const swap = result[swapWith];
    if (current === undefined || swap === undefined) throw new Error('Shuffle index out of range.');
    result[index] = swap;
    result[swapWith] = current;
  }
  return result;
}

describe('Double Ratchet property: ping-pong under random drop/reorder within MAX_SKIP', () => {
  it('decrypts every delivered message to its original plaintext regardless of order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.array(fc.string({ minLength: 0, maxLength: 40 }), { minLength: 1, maxLength: 30 }),
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 30 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }),
        (seed, plaintexts, swaps, keepFlags) => {
          const { aliceState, bobState } = establishedRatchetPair(seed);
          const ad = encoder.encode(`property-conversation-${String(seed)}`);
          const source = deterministicSource(seed);
          const receiverSource = deterministicSource(seed + 1);

          let sender = aliceState;
          const sent: SentMessage[] = [];
          for (const [index, plaintext] of plaintexts.entries()) {
            const encrypted = ratchetEncrypt(sender, encoder.encode(plaintext), ad, source);
            sender = encrypted.state;
            // Every message stays within the bounded skip window from the receiver's perspective:
            // it never accumulates more than MAX_SKIP unread messages before being delivered.
            if (index < MAX_SKIP) sent.push({ plaintext, encrypted: encrypted.output });
          }

          // Drop some messages (never delivered) using the boolean stream, but always keep at
          // least one so the property has something to assert.
          const delivered = sent.filter((_, index) => keepFlags[index % keepFlags.length] ?? true);
          if (delivered.length === 0) delivered.push(...sent.slice(0, 1));

          const order = shuffle(delivered, swaps);
          let receiver: DoubleRatchetState = bobState;
          for (const message of order) {
            const opened = ratchetDecrypt(receiver, message.encrypted, ad, receiverSource);
            receiver = opened.state;
            expect(decoder.decode(opened.output)).toBe(message.plaintext);
          }
        },
      ),
      { numRuns: 50 },
    );
    // 50 fuzz iterations of real X25519/AEAD work. Comfortably under a second idle, but it
    // overran vitest's 5s default whenever the machine was also building another workspace,
    // which made `pnpm verify` fail intermittently for reasons unrelated to the code.
  }, 30_000);
});

describe('Double Ratchet fuzz: mutated ciphertext/header never leaks plaintext', () => {
  it('always throws a CryptoError subclass and never returns output for a mutated message', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.constantFrom<'ciphertext' | 'encryptedHeader'>('ciphertext', 'encryptedHeader'),
        (seed, mutationSeed, field) => {
          const { aliceState, bobState } = establishedRatchetPair(seed);
          const ad = encoder.encode('fuzz-pair');
          const source = deterministicSource(seed);
          const receiverSource = deterministicSource(seed + 1);
          const encrypted = ratchetEncrypt(aliceState, encoder.encode('fuzz body'), ad, source);

          const target = encrypted.output[field].slice();
          if (target.length === 0) return;
          const byteIndex = mutationSeed % target.length;
          const current = target[byteIndex] ?? 0;
          target[byteIndex] = current ^ (1 + (mutationSeed % 255));
          const mutated: EncryptedRatchetMessage = { ...encrypted.output, [field]: target };

          expect(() => ratchetDecrypt(bobState, mutated, ad, receiverSource)).toThrow(
            E2eeProtocolError,
          );
          // The receiver's own state must not have advanced past the untouched fixture value.
          expect(bobState.receivedCount).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
    // Same reason as above, with twice the iterations.
  }, 30_000);
});
