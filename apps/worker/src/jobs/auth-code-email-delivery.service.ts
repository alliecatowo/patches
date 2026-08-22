import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  AuthCode,
  AuthCodeDeliveryEnvelopeError,
  decryptAuthCodeDelivery,
  type AuthCodeEmailJobType,
} from '@patches/database';
import { IsNull, MoreThan, type DataSource } from 'typeorm';

import { AppConfigService } from '../config/app-config.service.js';
import { DATA_SOURCE } from '../database/database.module.js';
import { EMAIL_PROVIDER, type EmailMessage, type EmailProvider } from '../email/email-provider.js';

/** Machine-safe failure text suitable for `last_error` and structured worker logs. */
const DELIVERY_FAILED = 'AUTH_CODE_DELIVERY_FAILED';

@Injectable()
export class AuthCodeEmailDeliveryService {
  constructor(
    @Inject(DATA_SOURCE) private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async deliver(
    jobType: AuthCodeEmailJobType,
    payload: unknown,
    buildMessage: (email: string, code: string) => EmailMessage,
  ): Promise<void> {
    const { envelope, plaintext } = decryptAuthCodeDelivery(
      jobType,
      payload,
      this.config.authCodeDeliveryKeys,
    );
    const purpose = jobType === 'SEND_VERIFICATION_EMAIL' ? 'VERIFY_EMAIL' : 'RESET_PASSWORD';
    const authCode = await this.dataSource.getRepository(AuthCode).findOne({
      where: {
        id: envelope.authCodeId,
        purpose,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });

    // Missing, expired, consumed, or wrong-purpose codes are already unusable. Treating them
    // as a successful no-op lets JobRunner atomically complete and scrub the envelope.
    if (authCode === null) return;
    if (hashCode(plaintext.code) !== authCode.codeHash) {
      throw new AuthCodeDeliveryEnvelopeError();
    }

    try {
      await this.emailProvider.send(buildMessage(plaintext.email, plaintext.code));
    } catch {
      // Provider errors can contain recipient addresses or response bodies. Normalize before
      // the exception reaches JobRunner, which persists/logs only this fixed string.
      throw new Error(DELIVERY_FAILED);
    }
  }
}

function hashCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}
