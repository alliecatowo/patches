import { z } from 'zod';
import { booleanish } from '../boolean.js';

/**
 * One `scheme://host[:port]` origin, no trailing slash/path — the exact shape a browser's
 * `Origin` request header sends and the exact shape `WEB_ORIGINS` entries must match to be
 * compared against it. `z.url({ protocol: /^https?$/ })` (not `z.httpUrl()` — see
 * `PUBLIC_ORIGIN` below) accepts a path/query/hash that an `Origin` header can never carry;
 * rejecting anything past the authority here catches a copy-pasted full URL in config instead
 * of silently never matching at request time.
 */
const originSchema = z
  .url({ protocol: /^https?$/ })
  .refine((value) => new URL(value).origin === value, {
    message: 'must be a bare origin (scheme://host[:port]), no path/query/fragment',
  });

/**
 * Plain (non-refined) shape, exported so other schemas/apps can compose it with
 * `z.object({ ...serverEnvShape, ... })` without fighting the `superRefine` wrapper below.
 */
export const serverEnvShape = {
  GRPC_HOST: z.string().default('127.0.0.1'),
  GRPC_PORT: z.coerce.number().int().min(1).max(65_535).default(50051),
  // The protocol is constrained explicitly: bare `z.url()` accepts `localhost:3000`,
  // reading `localhost:` as the scheme. `z.httpUrl()` is not used here because it also
  // constrains `hostname` to a dotted domain, which rejects `http://localhost:3000`.
  PUBLIC_ORIGIN: z.url({ protocol: /^https?$/ }),
  INVITE_ONLY: booleanish().default(true),
  /**
   * ADR 0016 §6: comma-separated allow-list of browser origins permitted to call the Connect
   * edge cross-origin. Default empty means same-origin only — no `Access-Control-Allow-Origin`
   * is ever emitted for a request whose `Origin` isn't in this list, and credentials mode
   * stays off regardless (ADR 0016 §5: bearer tokens only, never cookies).
   */
  WEB_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .pipe(z.array(originSchema)),
  /** Optional WebAuthn relying-party hostname; the server accessor falls back to PUBLIC_ORIGIN. */
  PASSKEY_RP_ID: z
    .string()
    .trim()
    .min(1)
    .optional()
    .refine((value) => {
      if (value === undefined) return true;
      try {
        return new URL(`https://${value}`).hostname === value.toLowerCase();
      } catch {
        return false;
      }
    }, 'must be a bare hostname'),
  /** Optional WebAuthn browser-origin allow-list, validated like WEB_ORIGINS. */
  PASSKEY_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .pipe(z.array(originSchema)),
  // Optional here: local/dev environments may run without JWT signing configured yet
  // (Phase 0). Production must have both — enforced below, not by the base type, so the
  // *reason* a boot fails is a clear, listed configuration error rather than a type error.
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  // Needed here (duplicated from baseEnvSchema) so this schema is self-contained and can
  // decide production-only requirements on its own.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
};

const serverEnvObjectSchema = z.object(serverEnvShape);

export const serverEnvSchema = serverEnvObjectSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'production') return;
  if (!value.JWT_PRIVATE_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_PRIVATE_KEY'],
      message: 'JWT_PRIVATE_KEY is required when NODE_ENV=production',
    });
  }
  if (!value.JWT_PUBLIC_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_PUBLIC_KEY'],
      message: 'JWT_PUBLIC_KEY is required when NODE_ENV=production',
    });
  }
});

export type ServerEnv = z.infer<typeof serverEnvObjectSchema>;
