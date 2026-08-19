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

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare rotatedAt: Date | null;
}
