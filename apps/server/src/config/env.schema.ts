import { z } from 'zod';

import {
  authEnvShape,
  baseEnvSchema,
  booleanish,
  databaseEnvSchema,
  loadEnv,
  serverEnvShape,
  storageEnvSchema,
} from '@patches/config';

export { ConfigError } from '@patches/config';
export type { ConfigIssue } from '@patches/config';

/**
 * Server environment contract (spec §97), composed from `@patches/config`'s shared
 * schema pieces plus the handful of things unique to this app:
 *
 *  - `LOG_LEVEL` uses Nest's `ConsoleLogger` vocabulary (`log`/`verbose`), not
 *    `@patches/config`'s generic one (`debug`/`info`/`warn`/`error`) — see
 *    `common/logging/logger.factory.ts`, which indexes into Nest's `LogLevel` list.
 *  - `DATABASE_URL` is optional here (persistence lands in Phase 1) but must be a
 *    valid Postgres URL once set, and production must always set it.
 *  - auth variables (signing keys, token TTLs, Argon2id cost, `NODE_DOMAIN`) come from
 *    `authEnvShape`; the signing keys are optional in dev but required in production.
 *  - `PUBLIC_ORIGIN` keeps a dev-friendly default; `@patches/config`'s shared shape
 *    leaves it required since not every consumer wants the same default.
 *
 * The app must refuse to boot on malformed configuration — never "fall back to a
 * default and hope".
 */
// Accepts both Nest's vocabulary (`log`/`verbose`) and the shared `@patches/config` one used
// by the worker (`info`), so one `LOG_LEVEL` value can be set app-wide (fly.toml `[env]`).
// `info` is normalised to Nest's `log` (found the hard way: `LOG_LEVEL=info` booted the
// worker and crashed the server, `LOG_LEVEL=log` did the reverse — A-038).
const nestLogLevelSchema = z
  .enum(['error', 'warn', 'info', 'log', 'debug', 'verbose'])
  .default('log')
  .transform((level): 'error' | 'warn' | 'log' | 'debug' | 'verbose' =>
    level === 'info' ? 'log' : level,
  );

const envObjectSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...serverEnvShape,
  // Spread after `serverEnvShape` on purpose: both declare JWT_PRIVATE_KEY/JWT_PUBLIC_KEY and
  // the auth shape's versions are the strict ones (base64-encoded PEM, label-checked).
  ...authEnvShape,
  ...storageEnvSchema.shape,
  LOG_LEVEL: nestLogLevelSchema,
  DATABASE_URL: databaseEnvSchema.shape.DATABASE_URL.optional(),
  PUBLIC_ORIGIN: serverEnvShape.PUBLIC_ORIGIN.default('http://localhost:3000'),

  /** Human-readable instance name reported by SystemService.GetServerInfo. */
  INSTANCE_NAME: z.string().min(1).max(80).default('patches-dev'),

  /**
   * Enables the standard `grpc.reflection.v1alpha.ServerReflection` service (B-006) so
   * `grpcurl -plaintext <host> list`/`describe` work without shipping `.proto` files to
   * whoever's debugging. Dev-only by default — a production server has no business
   * exposing its full schema to anything that can reach the port.
   */
  GRPC_REFLECTION: booleanish().default(false),
  /**
   * Trust the proxy-supplied client address (`fly-client-ip`, then the first
   * `x-forwarded-for` hop) as the caller's peer for rate limiting. Only enable behind a
   * proxy that always sets/overwrites those headers (Fly's edge does); off by default so a
   * direct caller can never spoof its own bucket (A-039).
   */
  TRUST_PROXY_HEADERS: booleanish().default(false),

  /**
   * GitHub OAuth device flow (P6-005, spec §167). Unset in dev/test by default — `AuthService`
   * answers `BeginGitHubLogin`/`PollGitHubLogin` with `NOT_IMPLEMENTED` rather than pretending
   * the flow works with no client id to authenticate as (§176's honest-UNIMPLEMENTED rule,
   * extended past Phase 1's schema-only stub to the real implementation).
   */
  GITHUB_CLIENT_ID: z.string().trim().min(1).optional(),
  /** Overridable so integration tests can point the device flow at a local fake GitHub
   * instead of the real github.com/api.github.com. */
  GITHUB_DEVICE_CODE_URL: z.url().default('https://github.com/login/device/code'),
  GITHUB_TOKEN_URL: z.url().default('https://github.com/login/oauth/access_token'),
  GITHUB_USER_API_URL: z.url().default('https://api.github.com/user'),
  /** Bounds every outbound call the device flow makes — an unbounded fetch to a third party
   * is exactly the kind of request spec §176's "timeout baseline" exists to require. */
  GITHUB_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  /**
   * Phase 8 two-node federation lab (P8-001..P8-008, `docs/architecture/federation.md`).
   * **Default off** (spec §108 Stage F1, §176's "self-hosted node ships with federation
   * disabled by default"): when false, `main.ts` never opens the HTTP listener at all — no
   * WebFinger, no actor documents, no inbox/outbox, nothing Internet-facing, because there is
   * nothing listening. This is a stricter reading than "WebFinger may always be on for
   * discovery" — the whole point of Stage F1 being "local and non-public" (federation.md §3.5)
   * is that a node with federation off has zero new network surface, not a smaller one.
   */
  FEDERATION_ENABLED: booleanish().default(false),
  /** HTTP listener port for the federation surface (WebFinger/actor/inbox/outbox), only bound
   * when `FEDERATION_ENABLED`. */
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8080),

  /**
   * B-026: AES-256-GCM key `KeyService` encrypts `federation_keys.private_key_*` under —
   * base64-encoded, must decode to exactly 32 bytes (`openssl rand -base64 32`). Optional
   * when federation is off (nothing ever calls `KeyService`); required below when
   * `FEDERATION_ENABLED=true`, since a federating node with no way to decrypt its own signing
   * keys can't federate at all.
   */
  FEDERATION_KEY_ENCRYPTION_KEY: z.string().trim().min(1).optional(),
});

export const envSchema = envObjectSchema.superRefine((value, ctx) => {
  if (value.FEDERATION_ENABLED) {
    if (value.FEDERATION_KEY_ENCRYPTION_KEY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['FEDERATION_KEY_ENCRYPTION_KEY'],
        message: 'FEDERATION_KEY_ENCRYPTION_KEY is required when FEDERATION_ENABLED=true',
      });
    } else if (Buffer.from(value.FEDERATION_KEY_ENCRYPTION_KEY, 'base64').length !== 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['FEDERATION_KEY_ENCRYPTION_KEY'],
        message: 'FEDERATION_KEY_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes',
      });
    }
  }

  if (value.NODE_ENV !== 'production') return;

  // Production-only requirements live here rather than in the base types so that a
  // misconfigured deploy fails with a listed configuration error naming the variable,
  // not a type error somewhere downstream.
  const requiredInProduction = ['DATABASE_URL', 'JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY'] as const;
  for (const key of requiredInProduction) {
    if (!value[key]) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is required when NODE_ENV=production`,
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate raw environment variables. Used both by `main.ts` (which needs the
 * bind address before Nest exists) and by `ConfigModule.forRoot({ validate })`.
 *
 * Throws {@link ConfigError} (from `@patches/config`) listing every invalid
 * variable — not just the first — so a misconfigured deploy can be fixed in one pass.
 */
export function validateEnv(raw: Record<string, string | undefined>): Env {
  return loadEnv(envSchema, raw);
}
