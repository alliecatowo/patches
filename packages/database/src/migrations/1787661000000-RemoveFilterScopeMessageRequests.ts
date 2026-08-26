import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * B-126: `FILTER_SCOPE_MESSAGE_REQUESTS` scoped the server-visible DM message-request flow
 * that ADR 0030 §B-095 already deleted (`RemoveLegacyServerVisibleDms1787660000000`) — the
 * scope itself was left in place at the time (`filter-enums.ts`'s doc comment) but is now dead
 * weight. Pre-alpha, zero users — dropping any leftover `MESSAGE_REQUESTS` rows/array elements
 * outright is safe (same consolidation policy `RemoveLegacyServerVisibleDms` used). The
 * protobuf enum value is separately `reserved`, never reused (spec §153, `filters.proto`).
 *
 * Order: delete/scrub the now-disallowed data before narrowing `filter_scopes`' CHECK
 * constraint, so the constraint change itself never fails against leftover rows.
 */
export class RemoveFilterScopeMessageRequests1787661000000 implements MigrationInterface {
  name = 'RemoveFilterScopeMessageRequests1787661000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A personal filter's own scope join rows (`filter_scopes`) — a filter that only ever
    // scoped `MESSAGE_REQUESTS` is left with zero scope rows, which is a pre-existing
    // valid-but-useless state the write path already tolerates (a filter with no scopes
    // simply never matches anything).
    await queryRunner.query(`DELETE FROM "filter_scopes" WHERE "scope" = 'MESSAGE_REQUESTS'`);
    await queryRunner.query(
      `ALTER TABLE "filter_scopes" DROP CONSTRAINT "chk_filter_scopes_scope"`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_scopes" ADD CONSTRAINT "chk_filter_scopes_scope" CHECK ("scope" IN ('HOME', 'LOCAL', 'TAG_FEED', 'COMMUNITY_FEED', 'NOTIFICATIONS', 'SEARCH'))`,
    );

    // `filter_list_subscriptions.scopes` is a plain `text[]` (no per-element CHECK) — scrub
    // the dead element out of any existing row's array rather than leaving it silently
    // unreachable, then move the column DEFAULT off it too.
    await queryRunner.query(
      `UPDATE "filter_list_subscriptions" SET "scopes" = array_remove("scopes", 'MESSAGE_REQUESTS')`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_list_subscriptions" ALTER COLUMN "scopes" SET DEFAULT '{HOME,LOCAL,TAG_FEED,COMMUNITY_FEED,NOTIFICATIONS,SEARCH}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Schema-only reversal (ADR 0030's pre-production consolidation policy, applied the same
    // way `RemoveLegacyServerVisibleDms` does): restores the `MESSAGE_REQUESTS`-capable shape
    // without restoring any deleted `filter_scopes` rows or re-adding the element to any
    // `filter_list_subscriptions.scopes` array it was scrubbed from.
    await queryRunner.query(
      `ALTER TABLE "filter_list_subscriptions" ALTER COLUMN "scopes" SET DEFAULT '{HOME,LOCAL,TAG_FEED,COMMUNITY_FEED,NOTIFICATIONS,SEARCH,MESSAGE_REQUESTS}'`,
    );

    await queryRunner.query(
      `ALTER TABLE "filter_scopes" DROP CONSTRAINT "chk_filter_scopes_scope"`,
    );
    await queryRunner.query(
      `ALTER TABLE "filter_scopes" ADD CONSTRAINT "chk_filter_scopes_scope" CHECK ("scope" IN ('HOME', 'LOCAL', 'TAG_FEED', 'COMMUNITY_FEED', 'NOTIFICATIONS', 'SEARCH', 'MESSAGE_REQUESTS'))`,
    );
  }
}
