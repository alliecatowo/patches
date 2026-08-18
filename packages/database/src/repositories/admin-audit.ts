import type { EntityManager } from 'typeorm';
import { AdminAuditLog } from '../entities/admin-audit-log.entity.js';
import type { AdminAuditSubjectType } from '../entities/enums.js';

export interface AppendAdminAuditLogInput {
  adminUserId: string;
  /** e.g. `invite.create`, `user.suspend`, `report.resolve`, `job.replay`. */
  action: string;
  subjectType: AdminAuditSubjectType;
  subjectId: string;
  /** Never a password, access token, refresh token, or reset code (§66) — callers are
   * responsible for keeping that true. */
  metadata?: Record<string, unknown> | null;
}

/**
 * Appends one row to `admin_audit_log` (`INITIAL_VISION.md` §65–66). Deliberately a plain
 * function over an `EntityManager`, not a Nest provider or a custom repository class — the
 * admin CLI (`apps/admin`) has no Nest/gRPC dependency at all (spec §128–129), and this
 * needs to be callable from a bare TypeORM transaction there.
 *
 * Callers must pass the **same transactional `EntityManager`** as the mutation this row
 * records, so "the CLI did something but nobody can see it happened" (a partial commit that
 * lands the mutation without the audit row, or vice versa) is impossible.
 */
export async function appendAdminAuditLog(
  manager: EntityManager,
  input: AppendAdminAuditLogInput,
): Promise<AdminAuditLog> {
  const repository = manager.getRepository(AdminAuditLog);
  return repository.save(
    repository.create({
      adminUserId: input.adminUserId,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      metadata: input.metadata ?? null,
    }),
  );
}
