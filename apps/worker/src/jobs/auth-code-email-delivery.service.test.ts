import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { encryptAuthCodeDelivery, type AuthCode } from '@patches/database';
import { describe, expect, it, vi } from 'vitest';

import { type AppConfigService } from '../config/app-config.service.js';
import { type EmailProvider } from '../email/email-provider.js';
import { AuthCodeEmailDeliveryService } from './auth-code-email-delivery.service.js';

const KEY_ID = 'test';
const KEYRING = { [KEY_ID]: randomBytes(32).toString('base64') };
const CODE = 'credential-secret';

function build(
  authCode: Pick<AuthCode, 'id' | 'codeHash'> | null,
  send = vi.fn<EmailProvider['send']>().mockResolvedValue(undefined),
) {
  const repository = { findOne: vi.fn().mockResolvedValue(authCode) };
  const dataSource = { getRepository: vi.fn().mockReturnValue(repository) };
  const config = { authCodeDeliveryKeys: KEYRING } as unknown as AppConfigService;
  const provider = { send };
  return {
    service: new AuthCodeEmailDeliveryService(dataSource as never, config, provider),
    repository,
    send,
  };
}

function envelope(authCodeId: string) {
  return encryptAuthCodeDelivery(
    'SEND_VERIFICATION_EMAIL',
    authCodeId,
    { email: 'person@example.test', code: CODE },
    KEY_ID,
    KEYRING,
  );
}

describe('AuthCodeEmailDeliveryService', () => {
  it('decrypts, validates the live row/hash, and sends without exposing envelope data', async () => {
    const id = randomUUID();
    const { service, repository, send } = build({ id, codeHash: hash(CODE) });

    await service.deliver('SEND_VERIFICATION_EMAIL', envelope(id), (email, code) => ({
      to: email,
      subject: 'subject',
      text: code,
      html: code,
    }));

    expect(repository.findOne).toHaveBeenCalledOnce();
    expect(JSON.stringify(repository.findOne.mock.calls)).toContain(id);
    expect(JSON.stringify(repository.findOne.mock.calls)).toContain('VERIFY_EMAIL');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'person@example.test', text: CODE }),
    );
  });

  it('successfully no-ops when the code row is missing, consumed, expired, or wrong-purpose', async () => {
    const id = randomUUID();
    const { service, send } = build(null);
    await expect(
      service.deliver('SEND_VERIFICATION_EMAIL', envelope(id), () => ({
        to: 'unused@example.test',
        subject: 'unused',
        html: 'unused',
      })),
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a code/hash mismatch with a fixed machine-safe error', async () => {
    const id = randomUUID();
    const { service } = build({ id, codeHash: hash('different') });
    await expect(
      service.deliver('SEND_VERIFICATION_EMAIL', envelope(id), () => ({
        to: 'unused@example.test',
        subject: 'unused',
        html: 'unused',
      })),
    ).rejects.toThrow('AUTH_CODE_DELIVERY_INVALID');
  });

  it('sanitizes provider failures before they reach the job runner', async () => {
    const id = randomUUID();
    const send = vi
      .fn<EmailProvider['send']>()
      .mockRejectedValue(
        new Error('provider body leaked person@example.test and credential-secret'),
      );
    const { service } = build({ id, codeHash: hash(CODE) }, send);
    await expect(
      service.deliver('SEND_VERIFICATION_EMAIL', envelope(id), (email, code) => ({
        to: email,
        subject: 'subject',
        text: code,
        html: code,
      })),
    ).rejects.toThrow('AUTH_CODE_DELIVERY_FAILED');
  });
});

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
