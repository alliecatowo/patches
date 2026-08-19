import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `filter_list_subscriptions.scopes` (P14-022, `INITIAL_VISION.md` §199.1 "an action and
 * scopes the subscriber chooses") — the subscriber-chosen counterpart to a personal filter's
 * `filter_scopes` join table, stored as a plain `text[]` here rather than a second join table
 * since a subscription is a single row per (actor, list) and the set is small and bounded
 * (`FILTER_SCOPES` has 7 members). Defaults to every scope, matching the "empty means every
 * scope" default `filter-lists/filter-list.service.ts#subscribeFilterList` applies at the
 * service layer — see `filter-list-subscription.entity.ts`'s doc comment.
 */
export class FilterListSubscriptionScopes1787159166765 implements MigrationInterface {
  name = 'FilterListSubscriptionScopes1787159166765';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "filter_list_subscriptions" ADD "scopes" text array NOT NULL DEFAULT ARRAY['HOME', 'LOCAL', 'TAG_FEED', 'COMMUNITY_FEED', 'NOTIFICATIONS', 'SEARCH', 'MESSAGE_REQUESTS']::text[]`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "filter_list_subscriptions" DROP COLUMN "scopes"`);
  }
}
