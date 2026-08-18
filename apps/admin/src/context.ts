import 'reflect-metadata';

import { createDataSource } from '@patches/database';
import type { DataSource } from 'typeorm';

import { type AdminEnv } from './env.js';
import { findUserByHandle } from './lookups.js';

export interface AdminContext {
  dataSource: DataSource;
  /** `--as <handle>` resolved once at startup, or `undefined` if neither `--as` nor
   * `PATCHES_ADMIN_OPERATOR` was given — read commands work without one; mutating commands
   * call {@link requireOperatorUserId} and fail loudly instead. */
  operatorHandle: string | undefined;
}

export async function createAdminContext(
  env: AdminEnv,
  asHandle: string | undefined,
): Promise<AdminContext> {
  const dataSource = createDataSource({
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL,
    poolMax: env.DATABASE_POOL_MAX,
  });
  await dataSource.initialize();
  return { dataSource, operatorHandle: asHandle ?? env.PATCHES_ADMIN_OPERATOR };
}

/**
 * Resolves the operator every mutating command attributes its `admin_audit_log` row to
 * (spec §66 — "admin commands must write audit records"). Refuses to proceed without one:
 * an unattributable mutation is exactly the failure mode the audit log exists to prevent.
 */
export async function requireOperatorUserId(context: AdminContext): Promise<string> {
  if (context.operatorHandle === undefined) {
    throw new Error(
      'No operator identified. Pass --as <handle> or set PATCHES_ADMIN_OPERATOR so this ' +
        'action can be attributed in admin_audit_log.',
    );
  }

  const { user } = await findUserByHandle(context.dataSource, context.operatorHandle);
  return user.id;
}
