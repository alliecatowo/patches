import { z } from 'zod';

import {
  authEnvShape,
  baseEnvSchema,
  databaseEnvSchema,
  loadEnv,
  serverEnvShape,
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
const nestLogLevelSchema = z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log');

const envObjectSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...serverEnvShape,
  // Spread after `serverEnvShape` on purpose: both declare JWT_PRIVATE_KEY/JWT_PUBLIC_KEY and
  // the auth shape's versions are the strict ones (base64-encoded PEM, label-checked).
  ...authEnvShape,
  LOG_LEVEL: nestLogLevelSchema,
  DATABASE_URL: databaseEnvSchema.shape.DATABASE_URL.optional(),
  PUBLIC_ORIGIN: serverEnvShape.PUBLIC_ORIGIN.default('http://localhost:3000'),

  /** Human-readable instance name reported by SystemService.GetServerInfo. */
  INSTANCE_NAME: z.string().min(1).max(80).default('patches-dev'),
});

export const envSchema = envObjectSchema.superRefine((value, ctx) => {
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
