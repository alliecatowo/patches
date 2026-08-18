import { z } from 'zod';

/** Environment/logging basics every app/worker/CLI needs. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
