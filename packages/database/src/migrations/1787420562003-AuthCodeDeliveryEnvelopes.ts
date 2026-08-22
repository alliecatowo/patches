import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AuthCodeDeliveryEnvelopes1787420562003 implements MigrationInterface {
  name = 'AuthCodeDeliveryEnvelopes1787420562003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fail closed: any undelivered legacy plaintext credential becomes unusable before the
    // payload is scrubbed. Completed jobs keep the hashed row because their already-delivered
    // code may still be consumed; every other legacy job requires the user to request anew.
    await queryRunner.query(
      `DELETE FROM "auth_codes" WHERE "id" IN (
        SELECT CASE
          WHEN (job."payload"->>'authCodeId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (job."payload"->>'authCodeId')::uuid
          ELSE NULL
        END
        FROM "outbox_jobs" job
        WHERE job."type" IN ('SEND_VERIFICATION_EMAIL', 'SEND_PASSWORD_RESET_EMAIL')
          AND job."status" <> 'COMPLETED'
          AND job."payload" ?| ARRAY['code', 'email', 'userId']
      )`,
    );
    await queryRunner.query(
      `UPDATE "outbox_jobs"
       SET "status" = CASE WHEN "status" = 'COMPLETED' THEN 'COMPLETED' ELSE 'DEAD' END,
           "payload" = '{"v":1,"redacted":true}'::jsonb,
           "last_error" = CASE
             WHEN "status" = 'COMPLETED' THEN NULL
             ELSE 'AUTH_CODE_DELIVERY_LEGACY_REDACTED'
           END,
           "locked_at" = NULL,
           "locked_by" = NULL
       WHERE "type" IN ('SEND_VERIFICATION_EMAIL', 'SEND_PASSWORD_RESET_EMAIL')
         AND "payload" ?| ARRAY['code', 'email', 'userId']`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_jobs" ADD CONSTRAINT "chk_outbox_jobs_auth_email_payload" CHECK ("type" NOT IN ('SEND_VERIFICATION_EMAIL', 'SEND_PASSWORD_RESET_EMAIL') OR NOT ("payload" ?| ARRAY['code', 'email', 'userId']))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "outbox_jobs" DROP CONSTRAINT "chk_outbox_jobs_auth_email_payload"`,
    );
  }
}
