import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Passkeys/WebAuthn (P15-004, ADR 0022). Adds only `webauthn_challenges` — `credentials`
 * already accepts `type = 'PASSKEY'` (`chk_credentials_type` has carried it, unused, since
 * `1787036506325-Phase1Schema.ts`), and every other passkey field reuses an existing
 * `credentials` column (`identifier` = WebAuthn credential id, `publicMaterial` = COSE public
 * key, `metadata` = sign count/transports/device type), so this migration needs no
 * `credentials` change at all. Hand-written rather than `db:generate`-produced, mirroring
 * `ssh_login_challenges` (`1787036506325-Phase1Schema.ts`).
 */
export class Phase15Passkeys1787180000000 implements MigrationInterface {
  name = 'Phase15Passkeys1787180000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "webauthn_challenges" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "challenge" text NOT NULL, "purpose" text NOT NULL, "bound_user_id" uuid, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_webauthn_challenges_purpose" CHECK ("purpose" IN ('REGISTRATION', 'LOGIN')), CONSTRAINT "pk_webauthn_challenges_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_webauthn_challenges_challenge" ON "webauthn_challenges" ("challenge")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_webauthn_challenges_expires_at" ON "webauthn_challenges" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_webauthn_challenges_expires_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_webauthn_challenges_challenge"`);
    await queryRunner.query(`DROP TABLE "webauthn_challenges"`);
  }
}
