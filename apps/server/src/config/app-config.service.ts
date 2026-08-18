import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from './env.schema.js';

/**
 * Typed accessor over the validated environment.
 *
 * Application code injects this rather than `ConfigService` so that a rename in
 * the environment contract is a single-file change and nothing reads
 * `process.env` directly (spec §97).
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

  get grpcUrl(): string {
    return `${this.get('GRPC_HOST')}:${String(this.get('GRPC_PORT'))}`;
  }

  get publicOrigin(): string {
    return this.get('PUBLIC_ORIGIN');
  }

  get instanceName(): string {
    return this.get('INSTANCE_NAME');
  }

  get databaseUrl(): string | undefined {
    return this.get('DATABASE_URL');
  }
}
