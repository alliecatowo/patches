import type {
  ConversationKind as DbConversationKind,
  ConversationSecurityMode as DbConversationSecurityMode,
} from '@patches/database';
import { dateToTimestamp } from '@patches/proto';
import type {
  Conversation as ProtoConversation,
  ConversationMember as ProtoConversationMember,
} from '@patches/proto';
import { ConversationKind, ConversationSecurityMode } from '@patches/proto/nest';

import { toProtoActor } from '../auth/auth.mapper.js';
import type { ConversationMemberView, ConversationView } from './messages.dto.js';

/** Application DTO → protobuf message (spec §128), field-by-field. */

const KIND_TO_PROTO: Readonly<Record<DbConversationKind, ConversationKind>> = Object.freeze({
  DIRECT: ConversationKind.CONVERSATION_KIND_DIRECT,
  GROUP: ConversationKind.CONVERSATION_KIND_GROUP,
});

/**
 * `E2EE_V1` is the only persisted value since ADR 0030 §B-095 removed `LEGACY_SERVER_VISIBLE`.
 * There is deliberately no inverse map: nothing in the server converts a proto mode back into a
 * persisted one, because nothing may change a conversation's mode after creation.
 */
const SECURITY_MODE_TO_PROTO: Readonly<
  Record<DbConversationSecurityMode, ConversationSecurityMode>
> = Object.freeze({
  E2EE_V1: ConversationSecurityMode.CONVERSATION_SECURITY_MODE_E2EE_V1,
});

function toProtoConversationMember(view: ConversationMemberView): ProtoConversationMember {
  return {
    actor: toProtoActor(view.actor),
    joinedAt: dateToTimestamp(view.joinedAt),
    leftAt: view.leftAt === null ? undefined : dateToTimestamp(view.leftAt),
    lastReadMessageId: view.lastReadMessageId ?? '',
    muted: view.muted,
  };
}

export function toProtoConversation(view: ConversationView): ProtoConversation {
  return {
    id: view.id,
    kind: KIND_TO_PROTO[view.kind],
    securityMode: SECURITY_MODE_TO_PROTO[view.securityMode],
    createdBy: view.createdBy === null ? undefined : toProtoActor(view.createdBy),
    members: view.members.map(toProtoConversationMember),
    createdAt: dateToTimestamp(view.createdAt),
    lastMessageAt: dateToTimestamp(view.lastMessageAt),
    unreadCount: view.unreadCount,
  };
}
