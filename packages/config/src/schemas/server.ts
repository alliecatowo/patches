import { z } from 'zod';
import { booleanish } from '../boolean.js';

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
