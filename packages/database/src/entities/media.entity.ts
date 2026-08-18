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
import { checkIn, MEDIA_STATES, type MediaState } from './enums.js';

/**
 * An uploaded image and its derivatives (`INITIAL_VISION.md` §27, §29–32). Rows are created
 * before the bytes exist (`PENDING_UPLOAD`): the client uploads directly to object storage
 * via a presigned URL — image bytes are never proxied through Node (§30, §153).
 *
 * `mime_type`/`width`/`height` are filled in by the media worker from the *decoded* file,
 * never from client-supplied values (§31).
 */
@Entity({ name: 'media' })
@Index(['ownerActorId', 'createdAt'])
@Check('chk_media_state', checkIn('state', MEDIA_STATES))
export class Media {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare ownerActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_actor_id' })
  declare ownerActor: Actor;

  @Column({ type: 'text', default: 'PENDING_UPLOAD' })
  declare state: MediaState;

  /** Object-storage keys (R2). Null until the corresponding derivative exists (§31). */
  @Column({ type: 'text', nullable: true })
  declare sourceObjectKey: string | null;

  @Column({ type: 'text', nullable: true })
  declare displayObjectKey: string | null;

  @Column({ type: 'text', nullable: true })
  declare thumbnailObjectKey: string | null;

  @Column({ type: 'text', nullable: true })
  declare mimeType: string | null;

  @Column({ type: 'int', nullable: true })
  declare width: number | null;

  @Column({ type: 'int', nullable: true })
  declare height: number | null;

  /**
   * `bigint` comes back from the `pg` driver as a **string** (JS numbers can't hold the full
   * int8 range) — typed as `string` deliberately, see `docs/research/typeorm-postgres.md` §7.
   */
  @Column({ type: 'bigint', nullable: true })
  declare byteSize: string | null;

  @Column({ type: 'text', nullable: true })
  declare altText: string | null;

  @Column({ type: 'text', nullable: true })
  declare contentHash: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  declare processedAt: Date | null;

  /** Tombstone — see the note on {@link Actor.deletedAt}. */
  @Column({ type: 'timestamptz', nullable: true })
  declare deletedAt: Date | null;
}
