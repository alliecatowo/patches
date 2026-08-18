import { z } from 'zod';

/** Environment/logging basics every app/worker/CLI needs. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Shared vocabulary is `debug|info|warn|error`; Nest's `log`/`verbose` are accepted and
  // normalised (`log`→`info`, `verbose`→`debug`) so one app-wide LOG_LEVEL fits every app.
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error', 'log', 'verbose'])
    .default('info')
    .transform((level): 'debug' | 'info' | 'warn' | 'error' =>
      level === 'log' ? 'info' : level === 'verbose' ? 'debug' : level,
    ),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
