import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { z } from 'zod';

import {
  authCodeDeliveryEnvelopeSchema,
  type AuthCodeDeliveryEnvelope,
  type AuthCodeDeliveryKeyring,
} from './payloads.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AAD_PREFIX = 'patches.auth-code-delivery.v1';

export const AUTH_CODE_EMAIL_JOB_TYPES = [
  'SEND_VERIFICATION_EMAIL',
  'SEND_PASSWORD_RESET_EMAIL',
] as const;
export type AuthCodeEmailJobType = (typeof AUTH_CODE_EMAIL_JOB_TYPES)[number];

const plaintextSchema = z
  .object({
    email: z.string().email().max(320),
    code: z.string().min(1).max(128),
  })
  .strict();
export type AuthCodeDeliveryPlaintext = z.infer<typeof plaintextSchema>;

/** Fixed, non-bearing failure: callers may log the message but never the envelope or plaintext. */
export class AuthCodeDeliveryEnvelopeError extends Error {
  constructor() {
    super('AUTH_CODE_DELIVERY_INVALID');
    this.name = 'AuthCodeDeliveryEnvelopeError';
  }
}

export function encryptAuthCodeDelivery(
  jobType: AuthCodeEmailJobType,
  authCodeId: string,
  plaintext: AuthCodeDeliveryPlaintext,
  activeKeyId: string,
  keyring: AuthCodeDeliveryKeyring,
): AuthCodeDeliveryEnvelope {
  try {
    const parsedPlaintext = plaintextSchema.parse(plaintext);
    const key = decodeKey(keyring[activeKeyId]);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(aad(jobType, authCodeId, activeKeyId));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(parsedPlaintext), 'utf8'),
      cipher.final(),
    ]);
    return authCodeDeliveryEnvelopeSchema.parse({
      v: 1,
      kid: activeKeyId,
      authCodeId,
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    });
  } catch {
    throw new AuthCodeDeliveryEnvelopeError();
  }
}

export function decryptAuthCodeDelivery(
  jobType: AuthCodeEmailJobType,
  input: unknown,
  keyring: AuthCodeDeliveryKeyring,
): { envelope: AuthCodeDeliveryEnvelope; plaintext: AuthCodeDeliveryPlaintext } {
  try {
    const envelope = authCodeDeliveryEnvelopeSchema.parse(input);
    const decipher = createDecipheriv(
      ALGORITHM,
      decodeKey(keyring[envelope.kid]),
      Buffer.from(envelope.iv, 'base64'),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(aad(jobType, envelope.authCodeId, envelope.kid));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plaintextJson = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const plaintext: unknown = JSON.parse(plaintextJson);
    return { envelope, plaintext: plaintextSchema.parse(plaintext) };
  } catch {
    throw new AuthCodeDeliveryEnvelopeError();
  }
}

export function isAuthCodeEmailJobType(type: string): type is AuthCodeEmailJobType {
  return AUTH_CODE_EMAIL_JOB_TYPES.some((candidate) => candidate === type);
}

function aad(jobType: AuthCodeEmailJobType, authCodeId: string, keyId: string): Buffer {
  return Buffer.from(`${AAD_PREFIX}\0${jobType}\0${authCodeId}\0${keyId}`, 'utf8');
}

function decodeKey(encoded: string | undefined): Buffer {
  if (encoded === undefined) throw new AuthCodeDeliveryEnvelopeError();
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new AuthCodeDeliveryEnvelopeError();
  }
  return key;
}
