import { z } from 'zod';

/**
 * Authentication configuration (`INITIAL_VISION.md` §34–§36, §166, ADR 0010).
 *
 * Signing keys arrive **base64-encoded PEM** rather than raw PEM: a PEM block is multi-line,
 * and multi-line values are exactly what `.env` files, Fly secrets and CI secret stores each
 * mangle differently. One base64 blob per key is a single line everywhere. `pnpm keys:generate`
 * prints values in this shape.
 *
 * `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` are also declared (as plain optional strings) by
 * `serverEnvShape`; the versions here are the stricter ones and are meant to override it when
 * both shapes are composed into one app schema — spread `authEnvShape` last.
 */

/** PEM label a decoded key must carry, so a swapped public/private key fails at boot. */
const PEM_LABELS = {
  private: 'PRIVATE KEY',
  public: 'PUBLIC KEY',
} as const;

function base64Pem(kind: keyof typeof PEM_LABELS) {
  const label = PEM_LABELS[kind];
  return z.string().superRefine((value, ctx) => {
    // `Buffer.from(x, 'base64')` never throws — it silently skips invalid characters — so
    // the round-trip comparison below is what actually rejects a non-base64 value.
    const decoded = Buffer.from(value, 'base64');
    if (
      decoded.length === 0 ||
      decoded.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Expected base64-encoded PEM (see `pnpm keys:generate`)',
      });
      return;
    }
    const pem = decoded.toString('utf8');
    if (!pem.includes(`-----BEGIN ${label}-----`)) {
      ctx.addIssue({
        code: 'custom',
        message: `Expected base64 of a PEM "${label}" block (${
          kind === 'private' ? 'PKCS#8' : 'SPKI'
        }); got something else`,
      });
    }
  });
}

/** Seconds, given as an integer string in the environment. */
const seconds = (fallback: number) => z.coerce.number().int().min(1).default(fallback);

export const authEnvShape = {
  /** base64(PEM PKCS#8 Ed25519 private key). Optional in dev; required in production. */
  JWT_PRIVATE_KEY: base64Pem('private').optional(),
  /** base64(PEM SPKI Ed25519 public key). Optional in dev; required in production. */
  JWT_PUBLIC_KEY: base64Pem('public').optional(),

  /** Access-token lifetime in seconds. §35 suggests ~15 minutes; keep it short. */
  ACCESS_TOKEN_TTL: seconds(15 * 60),
  /** Refresh-token lifetime in seconds (§36). Rotated on every use. */
  REFRESH_TOKEN_TTL: seconds(30 * 24 * 60 * 60),

  /**
   * Canonical domain of this node (§163, §169). Bound into every issued session and into the
   * SSH challenge blob, which is what stops a signature captured on one node from being
   * replayed against another (§166).
   */
  NODE_DOMAIN: z.string().min(1).max(253).default('localhost'),

  /**
   * Argon2id cost parameters (§34, OWASP baseline m=19456 KiB, t=2, p=1). Overridable because
   * §34 requires them to be benchmarked on deployment hardware — the defaults are the floor,
   * not a target.
   */
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(19_456).default(19_456),
  ARGON2_TIME_COST: z.coerce.number().int().min(2).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(16).default(1),
};

const authEnvObjectSchema = z.object(authEnvShape);

export const authEnvSchema = authEnvObjectSchema;

export type AuthEnv = z.infer<typeof authEnvObjectSchema>;
