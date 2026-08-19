import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import {
  checkIn,
  E2EE_EVIDENCE_VERIFICATION_STATUSES,
  type E2eeEvidenceVerificationStatus,
} from './enums.js';
import { Report } from './report.entity.js';

/** Consent/audit metadata for reporter-disclosed E2EE evidence. */
@Entity({ name: 'e2ee_report_evidence' })
@Check(
  'chk_e2ee_report_evidence_status',
  checkIn('verification_status', E2EE_EVIDENCE_VERIFICATION_STATUSES),
)
export class E2eeReportEvidence {
  @PrimaryColumn({ type: 'uuid' })
  declare reportId: string;

  @OneToOne(() => Report, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  declare report: Report;

  @Column({ type: 'text', default: 'PENDING' })
  declare verificationStatus: E2eeEvidenceVerificationStatus;

  /** Explicit user-consent event; ordinary E2EE delivery never writes this table. */
  @Column({ type: 'timestamptz' })
  declare consentedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare verifiedAt: Date | null;

  /** Content-free machine code only, never plaintext or key material. */
  @Column({ type: 'text', nullable: true })
  declare verificationFailureCode: string | null;
}
