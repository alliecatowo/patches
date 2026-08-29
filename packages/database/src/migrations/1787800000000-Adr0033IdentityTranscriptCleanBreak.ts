import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * ADR 0033 §5: the node-canonical and crypto-native identity transcript families are unified into
 * one encoder owned by `@patches/crypto`. Every previously-enrolled device's `certificate_bytes`/
 * `roster_bytes`/prekey-bundle signature was produced under the old node-canonical encoding this
 * change deletes, so any surviving row would fail closed in the new decoder (wrong domain
 * separator) — a node serving material every client now rejects is worse than serving none.
 *
 * Prod is a dev node with roughly one test user and session bootstrap has *never* succeeded on any
 * client (ADR 0033 §"Context"): no `E2EE_V1` session, ratchet state, or readable envelope exists
 * anywhere. Under ADR 0030's pre-alpha consolidation policy this is a clean break, not a migration
 * — every enrolled device row is invalidated, not translated, and each client re-enrolls on next
 * start the same way it already handles a wiped node (its device is absent from the served
 * roster).
 *
 * Deleted, in FK order (`e2ee_mailbox_envelopes` → … → `e2ee_identity_roots`): every table whose
 * rows are signed under the old transcript encoding. Not deleted: `conversations` (a conversation
 * survives re-enrollment — its `security_mode` doesn't depend on any identity transcript),
 * `e2ee_node_franking_keys` (node-owned, encoding-independent), and `e2ee_report_evidence`
 * (evidence is never destroyed by a schema change, ADR 0033 §5's own text — verified empty on the
 * live node 2026-08-26, but `up()` still fails loudly rather than deleting if a row exists, so a
 * future re-run against a database that *does* hold evidence stops cold instead of destroying it).
 * `e2ee_report_evidence_items` is protected transitively, not by its own guard: its `report_id` FK
 * is non-nullable with `onDelete: 'CASCADE'` to `e2ee_report_evidence`
 * (`e2ee-report-evidence-item.entity.ts`), so an empty `e2ee_report_evidence` guarantees an empty
 * `e2ee_report_evidence_items` — there is no row in that table that could lack a parent.
 *
 * Known residue, stated rather than hidden: `e2ee_conversation_membership_events` rows survive
 * (their table is not transcript-signed), but any carrying a non-zero `root_signature`/
 * `root_generation` were made under roots this migration deletes, so they become permanently
 * unverifiable. Zero-impact on this node — no non-GENESIS epoch row exists (session bootstrap
 * never succeeded pre-ADR 0033) — and deleting audit history instead would be worse. If a future
 * node ever re-runs an equivalent clean break with live epochs, it must decide the fate of those
 * rows explicitly rather than inherit this note.
 *
 * Irreversible by design: `down()` throws. There is nothing to restore *to* — the old encoding is
 * gone from every process that could read it back.
 */
export class Adr0033IdentityTranscriptCleanBreak1787800000000 implements MigrationInterface {
  name = 'Adr0033IdentityTranscriptCleanBreak1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT count(*)::text AS count FROM "e2ee_report_evidence"`,
    )) as { count: string }[];
    const count = rows[0]?.count ?? '0';
    if (count !== '0') {
      throw new Error(
        `Adr0033IdentityTranscriptCleanBreak1787800000000 refuses to run: ` +
          `"e2ee_report_evidence" has ${count} row(s). Evidence is never destroyed by a schema ` +
          `change (ADR 0033 §5) — this migration only deletes rows signed under the retired ` +
          `node-canonical identity transcript encoding, and evidence rows are out of scope by ` +
          `policy, not by accident.`,
      );
    }

    await queryRunner.query(`DELETE FROM "e2ee_mailbox_envelopes"`);
    await queryRunner.query(`DELETE FROM "e2ee_logical_messages"`);
    await queryRunner.query(`DELETE FROM "e2ee_group_control_events"`);
    await queryRunner.query(`DELETE FROM "e2ee_one_time_prekeys"`);
    await queryRunner.query(`DELETE FROM "e2ee_one_time_prekey_key_ids"`);
    await queryRunner.query(`DELETE FROM "e2ee_signed_prekeys"`);
    await queryRunner.query(`DELETE FROM "e2ee_device_rosters"`);
    await queryRunner.query(`DELETE FROM "e2ee_device_identities"`);
    await queryRunner.query(`DELETE FROM "e2ee_identity_roots"`);
  }

  // Not `async`: there is no `await` in this body, and an `async` function whose body never
  // suspends is exactly what `@typescript-eslint/require-await` flags. A synchronous throw
  // still rejects the `Promise<any>` `MigrationInterface#down` declares.
  public down(): Promise<void> {
    throw new Error(
      'Adr0033IdentityTranscriptCleanBreak1787800000000 is irreversible by design (ADR 0033 §5): ' +
        'the deleted rows were signed under an identity transcript encoding no process in this ' +
        'monorepo can produce or verify anymore, so there is nothing a down-migration could ' +
        'restore them to.',
    );
  }
}
