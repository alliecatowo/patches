import { z } from 'zod';

/**
 * Server environment contract (spec §97).
 *
 * NOTE: this schema is deliberately self-contained for Phase 0. `@patches/config`
 * is being built in parallel and already exposes a `serverEnvShape` with the same
 * variable names; once it lands this file becomes a thin re-export. Keep the names
 * and defaults identical so that swap stays mechanical.
 *
 * The app must refuse to boot on malformed configuration — never "fall back to a
 * default and hope".
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Nest log level floor. `log` is the sensible production default. */
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),

  /** Interface the gRPC server binds to. `0.0.0.0` in containers. */
  GRPC_HOST: z.string().min(1).default('127.0.0.1'),
  GRPC_PORT: z.coerce.number().int().min(1).max(65_535).default(50_051),

  /**
   * Canonical public origin of this instance, used for links and federation IDs.
   *
   * The protocol is constrained explicitly: bare `z.url()` accepts
   * `localhost:3000`, reading `localhost:` as the scheme.
   */
  PUBLIC_ORIGIN: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),

  /** Human-readable instance name reported by SystemService.GetServerInfo. */
  INSTANCE_NAME: z.string().min(1).max(80).default('patches-dev'),

  /** Optional in Phase 0 — persistence lands in Phase 1. */
  DATABASE_URL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Thrown when the process environment does not satisfy {@link envSchema}. */
export class InvalidConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid server configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'InvalidConfigurationError';
  }
}

/**
 * Validate raw environment variables. Used both by `main.ts` (which needs the
 * bind address before Nest exists) and by `ConfigModule.forRoot({ validate })`.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new InvalidConfigurationError(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.') || '(root)';
        return `${path}: ${issue.message}`;
      }),
    );
  }
  return result.data;
}
