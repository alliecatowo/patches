import { z } from 'zod';
import { booleanish } from '../boolean.js';

/** PostgreSQL connection configuration, shared by `packages/database`'s DataSource and the CLI. */
export const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
  // Only required in test-running processes; kept optional here so a plain server/worker
  // boot doesn't need it. See `packages/testkit`, which reads it directly.
  TEST_DATABASE_URL: z.url().optional(),
  DATABASE_SSL: booleanish().default(false),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  /** Per-connection statement timeout (e.g. '10s', '30s'). Applied via pg `statement_timeout`. */
  DATABASE_STATEMENT_TIMEOUT: z.string().default('10s'),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
