import type { ConversationKind, ConversationSecurityMode } from '@patches/database';

import type { ActorSummary } from '../auth/auth.dto.js';

/**
 * `MessagesService`'s own vocabulary (spec §128–129) — `Conversation`/`ConversationMember`
 * entities never reach `MessagesController`.
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
   * Fixed at creation and never converted (ADR 0020). Always `E2EE_V1` since ADR 0030 §B-095
   * removed `LEGACY_SERVER_VISIBLE` — carried on the view rather than hardcoded client-side so
   * a client never has to assume the mode of a conversation it's rendering.
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

export interface ListPage<T> {
  items: T[];
  nextCursor: string;
  hasMore: boolean;
}
