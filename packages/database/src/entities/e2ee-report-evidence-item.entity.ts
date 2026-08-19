import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { E2eeReportEvidence } from './e2ee-report-evidence.entity.js';

/**
 * One explicitly selected plaintext disclosure. Position 0 is the subject; at most ten additional
 * surrounding messages may be attached. This is the only E2EE plaintext table on the node.
 */
@Entity({ name: 'e2ee_report_evidence_items' })
@Index(['reportId', 'logicalMessageId'], { unique: true })
@Check('chk_e2ee_report_evidence_items_position', '"position" >= 0 AND "position" <= 10')
@Check(
  'chk_e2ee_report_evidence_items_sizes',
  'octet_length("disclosed_plaintext") <= 8192 AND octet_length("opening") <= 4096 AND octet_length("envelope_transcript") <= 65536',
)
@Check('chk_e2ee_report_evidence_items_digest_length', 'octet_length("roster_digest") = 32')
export class E2eeReportEvidenceItem {
  @PrimaryColumn({ type: 'uuid' })
  declare reportId: string;

  @ManyToOne(() => E2eeReportEvidence, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  declare evidence: E2eeReportEvidence;

  @PrimaryColumn({ type: 'smallint' })
  declare position: number;

  /** No FK: evidence remains after ordinary mailbox/message retention deletes its source. */
  @Column({ type: 'uuid' })
  declare logicalMessageId: string;

  @Column({ type: 'bytea' })
  declare disclosedPlaintext: Buffer;

  @Column({ type: 'bytea' })
  declare opening: Buffer;

  @Column({ type: 'bytea' })
  declare envelopeTranscript: Buffer;

  @Column({ type: 'bytea' })
  declare frankingTag: Buffer;

  @Column({ type: 'bytea' })
  declare participantTranscript: Buffer;

  @Column({ type: 'bytea' })
  declare rosterDigest: Buffer;
}
