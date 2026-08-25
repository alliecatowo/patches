import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * B-077: reconciles `filter_list_subscriptions.scopes`'s DEFAULT with
 * `filter-list-subscription.entity.ts`'s corrected literal. The original
 * `FilterListSubscriptionScopes1787159166765` migration set this default via an
 * `ARRAY['HOME', ...]::text[]` call expression; TypeORM 1.x's postgres driver can never see
 * that as equal to what it reads back (it strips `::cast` suffixes from the introspected value
 * before comparing, and lowercases everything outside quotes on the entity side, permanently
 * turning `ARRAY[` into `array[`), so every `migration:generate` proposed this exact `ALTER
 * ... SET DEFAULT` again — see the entity's doc comment for the full mechanism. This migration
 * moves the stored default to the quoted `'{...}'` array-literal form the entity now computes,
 * which needs no cast and has no keyword outside its quotes, so it is stable under both of
 * TypeORM's comparisons. Semantically a no-op: same `text[]` value, same 7 scopes, same order.
 */
export class FilterListSubscriptionScopesDefaultReconciliation1787658107141 implements MigrationInterface {
  name = 'FilterListSubscriptionScopesDefaultReconciliation1787658107141';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "filter_list_subscriptions" ALTER COLUMN "scopes" SET DEFAULT '{HOME,LOCAL,TAG_FEED,COMMUNITY_FEED,NOTIFICATIONS,SEARCH,MESSAGE_REQUESTS}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "filter_list_subscriptions" ALTER COLUMN "scopes" SET DEFAULT ARRAY['HOME', 'LOCAL', 'TAG_FEED', 'COMMUNITY_FEED', 'NOTIFICATIONS', 'SEARCH', 'MESSAGE_REQUESTS']::text[]`,
    );
  }
}
