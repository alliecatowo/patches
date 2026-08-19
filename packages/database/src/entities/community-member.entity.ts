import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Actor } from './actor.entity.js';
import { Community } from './community.entity.js';
import { checkIn, COMMUNITY_ROLES, type CommunityRole } from './enums.js';

/**
 * A community membership (`INITIAL_VISION.md` §189). Composite PK, same shape as
 * `Like`/`Bookmark` — an actor is either a member of a community or not, never twice.
 */
@Entity({ name: 'community_members' })
// Not in §189's literal index list, but required by §190's "every new list RPC is
// cursor-paginated": `ListCommunityMembers` pages by `(joined_at DESC, actor_id DESC)` —
// `actor_id` is the tiebreaker, already unique per `community_id` (the PK), same pattern as
// `Like`/`Bookmark`.
@Index(['communityId', 'joinedAt', 'actorId'])
@Check('chk_community_members_role', checkIn('role', COMMUNITY_ROLES))
export class CommunityMember {
  @PrimaryColumn({ type: 'uuid' })
  declare communityId: string;

  @ManyToOne(() => Community, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'community_id' })
  declare community: Community;

  @PrimaryColumn({ type: 'uuid' })
  declare actorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  declare actor: Actor;

  @Column({ type: 'text', default: 'MEMBER' })
  declare role: CommunityRole;

  @CreateDateColumn({ type: 'timestamptz' })
  declare joinedAt: Date;
}
