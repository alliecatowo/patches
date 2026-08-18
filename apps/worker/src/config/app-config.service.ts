import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from './env.schema.js';

/**
 * Typed accessor over the validated environment.
 *
 * Application code injects this rather than `ConfigService` so that a rename in the
 * environment contract is a single-file change and nothing reads `process.env` directly
 * (spec §97, `.claude/rules/server.md`).
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.get('LOG_LEVEL');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  get databaseSsl(): boolean {
    return this.get('DATABASE_SSL');
  }

  get databasePoolMax(): number {
    return this.get('DATABASE_POOL_MAX');
  }

  get emailProvider(): Env['EMAIL_PROVIDER'] {
    return this.get('EMAIL_PROVIDER');
  }

  get emailFrom(): string {
    return this.get('EMAIL_FROM');
  }

  get smtpHost(): string | undefined {
    return this.get('SMTP_HOST');
  }

  get smtpPort(): number | undefined {
    return this.get('SMTP_PORT');
  }

  get resendApiKey(): string | undefined {
    return this.get('RESEND_API_KEY');
  }

  get workerId(): string {
    return this.get('WORKER_ID');
  }

  get concurrency(): number {
    return this.get('WORKER_CONCURRENCY');
  }

  get pollMs(): number {
    return this.get('WORKER_POLL_MS');
  }

  get idleBackoffMaxMs(): number {
    return this.get('WORKER_IDLE_BACKOFF_MAX_MS');
  }
}
