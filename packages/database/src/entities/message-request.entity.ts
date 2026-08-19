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
import { checkIn, MESSAGE_REQUEST_STATUSES, type MessageRequestStatus } from './enums.js';

/**
 * A pending contact request (`INITIAL_VISION.md` §183.4, §189) — the other new
 * unsolicited-contact vector alongside `CommunityInvite` (§192): rate-limited, block-aware,
 * individually mutable, never auto-accepts.
 *
 * The partial unique index below isn't in §189's literal column list, but §188's "1 pending
 * per (sender, recipient)" limit MUST exist as a database constraint where practical (§188's
 * preamble) — this is the same partial-unique-index technique §189 already uses for
 * `community_invites`.
 */
@Entity({ name: 'message_requests' })
@Index(['senderActorId', 'recipientActorId'], {
  unique: true,
  where: `"status" = 'PENDING'`,
})
@Index(['recipientActorId', 'createdAt', 'id'])
@Check('chk_message_requests_status', checkIn('status', MESSAGE_REQUEST_STATUSES))
export class MessageRequest {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  @Column({ type: 'uuid' })
  declare senderActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_actor_id' })
  declare senderActor: Actor;

  @Column({ type: 'uuid' })
  declare recipientActorId: string;

  @ManyToOne(() => Actor, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_actor_id' })
  declare recipientActor: Actor;

  /** Max 2,000 characters (§188) — same body budget as an ordinary message. Exactly one
   * message per request (§188): accepting is what turns this into an ordinary
   * `Conversation`/`Message`. */
  @Column({ type: 'text' })
  declare body: string;

  @Column({ type: 'text', default: 'PENDING' })
  declare status: MessageRequestStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
