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

/** Canonical signed roster snapshots form a monotonic digest chain per actor. */
@Entity({ name: 'e2ee_device_rosters' })
@Index(['actorId', 'sequence'], { unique: true })
@Index(['digest'], { unique: true })
@Check(
  'chk_e2ee_device_rosters_digest_lengths',
  'octet_length("previous_digest") = 32 AND octet_length("digest") = 32',
)
@Check('chk_e2ee_device_rosters_signature_length', 'octet_length("root_signature") = 64')
@Check('chk_e2ee_device_rosters_sequence', '"sequence" > 0')
export class E2eeDeviceRoster {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  /** PostgreSQL bigint is returned as a string by pg. */
  @Column({ type: 'bigint' })
  declare sequence: string;

  @Column({ type: 'bytea' })
  declare previousDigest: Buffer;

  @Column({ type: 'bytea' })
  declare digest: Buffer;

  @Column({ type: 'bytea' })
  declare rosterBytes: Buffer;

  @Column({ type: 'bytea' })
  declare rootSignature: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
