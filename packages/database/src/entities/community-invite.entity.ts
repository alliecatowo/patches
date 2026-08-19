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
import { Community } from './community.entity.js';
import { checkIn, COMMUNITY_INVITE_STATUSES, type CommunityInviteStatus } from './enums.js';

/**
 * A community invite (`INITIAL_VISION.md` §189) — one of the two new unsolicited-contact
 * vectors (§192, alongside `MessageRequest`): rate-limited, block-aware, individually
 * mutable, never auto-joins.
 */
@Entity({ name: 'community_invites' })
// §189's exact uniqueness: a second invite to the same (community, invitee) pair is only
// blocked while the first is still pending — a declined invite can be re-sent.
@Index(['communityId', 'inviteeActorId'], {
  unique: true,
  where: `"status" = 'PENDING'`,
})
@Index(['inviteeActorId', 'createdAt', 'id'])
@Check('chk_community_invites_status', checkIn('status', COMMUNITY_INVITE_STATUSES))
export class CommunityInvite {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare communityId: string;

  @ManyToOne(() => Community, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'community_id' })
  declare community: Community;

  @Column({ type: 'uuid' })
  declare inviterActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviter_actor_id' })
  declare inviterActor: Actor;

  @Column({ type: 'uuid' })
  declare inviteeActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invitee_actor_id' })
  declare inviteeActor: Actor;

  @Column({ type: 'text', default: 'PENDING' })
  declare status: CommunityInviteStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
