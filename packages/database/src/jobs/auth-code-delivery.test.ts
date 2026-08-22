import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  AuthCodeDeliveryEnvelopeError,
  decryptAuthCodeDelivery,
  encryptAuthCodeDelivery,
} from './auth-code-delivery.js';
import {
  authCodeDeliveryEnvelopeSchema,
  authCodeDeliveryKeyringJsonSchema,
  authCodeDeliveryKeyringSchema,
} from './payloads.js';

const KEY_ID = '2026-08-a';
const KEYRING = { [KEY_ID]: randomBytes(32).toString('base64') };
const AUTH_CODE_ID = randomUUID();

describe('auth-code delivery envelopes', () => {
  it('round-trips only the bounded plaintext under a fresh authenticated envelope', () => {
    const first = encryptAuthCodeDelivery(
      'SEND_VERIFICATION_EMAIL',
      AUTH_CODE_ID,
      { email: 'person@example.test', code: 'secret-code' },
      KEY_ID,
      KEYRING,
    );
    const second = encryptAuthCodeDelivery(
      'SEND_VERIFICATION_EMAIL',
      AUTH_CODE_ID,
      { email: 'person@example.test', code: 'secret-code' },
      KEY_ID,
      KEYRING,
    );

    expect(Object.hasOwn(first, 'email')).toBe(false);
    expect(Object.hasOwn(first, 'code')).toBe(false);
    expect(first.iv).not.toBe(second.iv);
    expect(decryptAuthCodeDelivery('SEND_VERIFICATION_EMAIL', first, KEYRING)).toEqual({
      envelope: first,
      plaintext: { email: 'person@example.test', code: 'secret-code' },
    });
  });

  it.each([
    ['job type', (envelope: Record<string, unknown>) => envelope, 'SEND_PASSWORD_RESET_EMAIL'],
    [
      'auth-code row',
      (envelope: Record<string, unknown>) => ({ ...envelope, authCodeId: randomUUID() }),
      'SEND_VERIFICATION_EMAIL',
    ],
    [
      'key id',
      (envelope: Record<string, unknown>) => ({ ...envelope, kid: 'different-key' }),
      'SEND_VERIFICATION_EMAIL',
    ],
    [
      'ciphertext',
      (envelope: Record<string, unknown>) => ({
        ...envelope,
        ciphertext: Buffer.from('tampered').toString('base64'),
      }),
      'SEND_VERIFICATION_EMAIL',
    ],
  ])('rejects a swapped or tampered %s with one safe error', (_name, mutate, type) => {
    const envelope = encryptAuthCodeDelivery(
      'SEND_VERIFICATION_EMAIL',
      AUTH_CODE_ID,
      { email: 'person@example.test', code: 'secret-code' },
      KEY_ID,
      KEYRING,
    );

    expect(() =>
      decryptAuthCodeDelivery(type as 'SEND_VERIFICATION_EMAIL', mutate(envelope), KEYRING),
    ).toThrow(AuthCodeDeliveryEnvelopeError);
    try {
      decryptAuthCodeDelivery(type as 'SEND_VERIFICATION_EMAIL', mutate(envelope), KEYRING);
    } catch (error) {
      expect((error as Error).message).toBe('AUTH_CODE_DELIVERY_INVALID');
    }
  });

  it('rejects non-canonical encodings, wrong lengths, extra fields, and plaintext payloads', () => {
    const envelope = encryptAuthCodeDelivery(
      'SEND_VERIFICATION_EMAIL',
      AUTH_CODE_ID,
      { email: 'person@example.test', code: 'secret-code' },
      KEY_ID,
      KEYRING,
    );
    expect(
      authCodeDeliveryEnvelopeSchema.safeParse({ ...envelope, iv: `${envelope.iv}\n` }).success,
    ).toBe(false);
    expect(
      authCodeDeliveryEnvelopeSchema.safeParse({
        ...envelope,
        tag: Buffer.alloc(15).toString('base64'),
      }).success,
    ).toBe(false);
    expect(
      authCodeDeliveryEnvelopeSchema.safeParse({ ...envelope, email: 'leak@example.test' }).success,
    ).toBe(false);
    expect(
      authCodeDeliveryEnvelopeSchema.safeParse({
        userId: randomUUID(),
        email: 'leak@example.test',
        code: 'plaintext',
      }).success,
    ).toBe(false);
  });

  it('validates key ids and canonical 32-byte keys', () => {
    expect(authCodeDeliveryKeyringSchema.safeParse(KEYRING).success).toBe(true);
    expect(authCodeDeliveryKeyringSchema.safeParse({ 'bad key': KEYRING[KEY_ID] }).success).toBe(
      false,
    );
    expect(
      authCodeDeliveryKeyringSchema.safeParse({ [KEY_ID]: Buffer.alloc(31).toString('base64') })
        .success,
    ).toBe(false);
  });

  it('does not expose a key id when JSON keyring validation fails', () => {
    const result = authCodeDeliveryKeyringJsonSchema.safeParse(
      JSON.stringify({ 'secret-rotation-id': Buffer.alloc(31).toString('base64') }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secret-rotation-id');
  });
});
