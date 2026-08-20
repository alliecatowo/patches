import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P15-006: generic OIDC-device-flow credential (GitLab/Codeberg/any node-configured provider).
 *
 * Widens `chk_credentials_type` to add `'OIDC'` — hand-added rather than
 * `pnpm db:generate`-produced, since `migration:generate`'s diff does not compare an existing
 * `@Check()` body on an unchanged table/column (see `1787170000000-Phase15AuthPolicy.ts`'s own
 * doc comment for the same caveat; confirmed again here — `db:generate` against this exact
 * change produced only an unrelated `filter_list_subscriptions.scopes` default-array diff and
 * said nothing about `chk_credentials_type` at all).
 *
 * No new column: identity stays separate from credential (ADR 0011) — an OIDC credential
 * stores `identifier = "<provider_id>:<subject>"` on the existing `credentials` table, so the
 * existing partial unique index `(type, identifier) WHERE revoked_at IS NULL` already enforces
 * (provider, subject) uniqueness with no schema change beyond this constraint.
 */
export class AddOidcCredentialType1787220000000 implements MigrationInterface {
  name = 'AddOidcCredentialType1787220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "credentials" DROP CONSTRAINT "chk_credentials_type"`);
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD CONSTRAINT "chk_credentials_type" CHECK ("type" IN ('PASSWORD', 'SSH_PUBLIC_KEY', 'GITHUB', 'PASSKEY', 'RECOVERY_CODE', 'OIDC'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "credentials" DROP CONSTRAINT "chk_credentials_type"`);
    await queryRunner.query(
      `ALTER TABLE "credentials" ADD CONSTRAINT "chk_credentials_type" CHECK ("type" IN ('PASSWORD', 'SSH_PUBLIC_KEY', 'GITHUB', 'PASSKEY', 'RECOVERY_CODE'))`,
    );
  }
}
