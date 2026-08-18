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

  /** Whether to attach `grpc.reflection.v1alpha.ServerReflection` (B-006). */
  get grpcReflection(): boolean {
    return this.get('GRPC_REFLECTION');
  }

  get databaseUrl(): string | undefined {
    return this.get('DATABASE_URL');
  }

  get databaseSsl(): boolean {
    return this.get('DATABASE_SSL');
  }

  get databasePoolMax(): number {
    return this.get('DATABASE_POOL_MAX');
  }

  get inviteOnly(): boolean {
    return this.get('INVITE_ONLY');
  }

  /** Canonical domain of this node (spec §163, §169). */
  get nodeDomain(): string {
    return this.get('NODE_DOMAIN');
  }

  get accessTokenTtlSeconds(): number {
    return this.get('ACCESS_TOKEN_TTL');
  }

  get refreshTokenTtlSeconds(): number {
    return this.get('REFRESH_TOKEN_TTL');
  }

  /**
   * PEM PKCS#8 Ed25519 signing key, decoded from its base64 env form. Undefined only in
   * non-production environments that have not run `pnpm keys:generate` yet — `TokenService`
   * turns that into a boot failure the first time a token is needed, not a silent unsigned
   * token.
   */
  get jwtPrivateKeyPem(): string | undefined {
    return decodePem(this.get('JWT_PRIVATE_KEY'));
  }

  /** PEM SPKI Ed25519 verification key, decoded from its base64 env form. */
  get jwtPublicKeyPem(): string | undefined {
    return decodePem(this.get('JWT_PUBLIC_KEY'));
  }

  get argon2Options(): { memoryCost: number; timeCost: number; parallelism: number } {
    return {
      memoryCost: this.get('ARGON2_MEMORY_KIB'),
      timeCost: this.get('ARGON2_TIME_COST'),
      parallelism: this.get('ARGON2_PARALLELISM'),
    };
  }
}

function decodePem(value: string | undefined): string | undefined {
  return value === undefined ? undefined : Buffer.from(value, 'base64').toString('utf8');
}
