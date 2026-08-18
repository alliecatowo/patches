import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { databaseEnvSchema, loadEnv, readDotEnvFile } from '@patches/config';
import { z } from 'zod';

/**
 * `apps/admin`'s environment contract: just enough to open a `DataSource` and attribute
 * audit rows to an operator (spec §65–66). No gRPC/`GRPC_*`, no email/storage config — this
 * CLI never boots the server or worker.
 */
export const adminEnvSchema = z.object({
  ...databaseEnvSchema.shape,
  /** The default `--as <handle>` when a command omits it. Still just a handle — the CLI
   * resolves it to a `users.id` the same way `--as` does, and every mutating command still
   * requires *some* operator to attribute the audit row to (spec §66). */
  PATCHES_ADMIN_OPERATOR: z.string().trim().min(1).optional(),
});

export type AdminEnv = z.infer<typeof adminEnvSchema>;

/**
 * Loads `.env` from the repo root in development — same technique as `apps/server/src/
 * main.ts`/`apps/worker/src/main.ts` (walk up looking for `pnpm-workspace.yaml`), never
 * overriding a variable the shell already set, never run in production.
 */
function loadDotEnv(): void {
  if (process.env.NODE_ENV === 'production') return;

  let current = process.cwd();
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) break;
    const parent = dirname(current);
    if (parent === current) return; // no repo root found; nothing to load
    current = parent;
  }

  const values = readDotEnvFile(join(current, '.env'));
  for (const [key, value] of Object.entries(values)) {
    process.env[key] ??= value;
  }
}

export function loadAdminEnv(): AdminEnv {
  loadDotEnv();
  return loadEnv(adminEnvSchema, process.env);
}
