import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';

/** Public account-root signing-key era. The node never receives the private root key. */
@Entity({ name: 'e2ee_identity_roots' })
@Index(['actorId', 'generation'], { unique: true })
// Partial: at most one *active* (non-rotated) root per actor at a time. Distinct column set
// from the index above on purpose — SnakeNamingStrategy's index name is derived from sorted
// column names only, not the predicate, so two indexes over the same columns would collide.
@Index(['actorId'], { unique: true, where: '"rotated_at" IS NULL' })
@Check('chk_e2ee_identity_roots_key_length', 'octet_length("public_key") = 32')
@Check('chk_e2ee_identity_roots_generation', '"generation" > 0')
@Check(
  'chk_e2ee_identity_roots_root_bytes_length',
  '"root_bytes" IS NULL OR octet_length("root_bytes") > 0',
)
@Check(
  'chk_e2ee_identity_roots_self_signature_length',
  '"self_signature" IS NULL OR octet_length("self_signature") = 64',
)
@Check(
  'chk_e2ee_identity_roots_previous_root_signature_length',
  '"previous_root_signature" IS NULL OR octet_length("previous_root_signature") = 64',
)
export class E2eeIdentityRoot {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @Column({ type: 'integer' })
  declare generation: number;

  @Column({ type: 'bytea' })
  declare publicKey: Buffer;

  // Nullable rather than the ideally-required NOT NULL: rows published before this column
  // existed have none, and ADR 0033 §5's row-wipe migration for this table is a separate,
  // independently-sequenced change (issue #251). The publish path (`identity-root.service.ts`)
  // always populates all three for every row it writes from here on; `toProtoIdentityRoot`
  // falls back to empty bytes only for the pre-migration rows this covers.
  @Column({ type: 'bytea', nullable: true })
  declare rootBytes: Buffer | null;

  // Ed25519, 64 bytes: the new root signing its own transcript (proof of possession).
  @Column({ type: 'bytea', nullable: true })
  declare selfSignature: Buffer | null;

  // Present only when the previous root signed the transition (a planned rotation).
  @Column({ type: 'bytea', nullable: true })
  declare previousRootSignature: Buffer | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare rotatedAt: Date | null;
}
