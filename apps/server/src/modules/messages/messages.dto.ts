import type {
  ConversationKind,
  ConversationSecurityMode,
  MessageRequestStatus,
} from '@patches/database';

import type { ActorSummary } from '../auth/auth.dto.js';

/**
 * `MessagesService`'s own vocabulary (spec §128–129) — `Conversation`/`Message`/
 * `MessageRequest` entities never reach `MessagesController`.
 */

export interface ConversationMemberView {
  actor: ActorSummary;
  joinedAt: Date;
  /** `null` while still a member. */
  leftAt: Date | null;
  /** The viewer's own marker, or `null` for every other member. Returning another actor's
   * marker would be a read receipt, which §183.3 explicitly prohibits. */
  lastReadMessageId: string | null;
  muted: boolean;
}

export interface ConversationView {
  id: string;
  kind: ConversationKind;
  /**
   * Fixed at creation and never converted (ADR 0017, ADR 0020). Carried on the view rather than
   * assumed by each client, because spec §183.1 requires the "this node's operators can read
   * these messages" disclosure on a legacy conversation and §194 forbids the word "encrypted"
   * for it — and a client can only render either correctly if the mode is on the wire.
   */
  securityMode: ConversationSecurityMode;
  /** `null` if the creator's account was later deleted. */
  createdBy: ActorSummary | null;
  members: ConversationMemberView[];
  createdAt: Date;
  lastMessageAt: Date;
  /** Unread count for the viewer specifically — never populated for anyone else (spec §183.3
   * — "unread state is per-viewer"). */
  unreadCount: number;
}

export interface MessageView {
  id: string;
  conversationId: string;
  /** `null` if the sender's account was later deleted. */
  sender: ActorSummary | null;
  /** Empty once tombstoned (spec §183.3). */
  body: string;
  createdAt: Date;
  /** `null` unless this message was deleted. */
  deletedAt: Date | null;
}

export interface MessageRequestView {
  id: string;
  sender: ActorSummary;
  recipient: ActorSummary;
  body: string;
  status: MessageRequestStatus;
  createdAt: Date;
}

export interface ListPage<T> {
  items: T[];
  nextCursor: string;
  hasMore: boolean;
}
