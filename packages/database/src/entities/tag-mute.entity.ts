import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Actor } from './actor.entity.js';
import { Tag } from './tag.entity.js';

/**
 * A muted tag (`INITIAL_VISION.md` §188, §189) — up to 100 per actor (§188), enforced in the
 * service layer. Composite PK, same shape as `Like`/`Bookmark`/`PostTag`.
 */
@Entity({ name: 'tag_mutes' })
export class TagMute {
  @PrimaryColumn({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @PrimaryColumn({ type: 'uuid' })
  declare tagId: string;

  @ManyToOne(() => Tag, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  declare tag: Tag;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
