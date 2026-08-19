import type {
  ConversationKind as DbConversationKind,
  ConversationSecurityMode as DbConversationSecurityMode,
  MessageRequestStatus as DbMessageRequestStatus,
} from '@patches/database';
import { dateToTimestamp } from '@patches/proto';
import type {
  Conversation as ProtoConversation,
  ConversationMember as ProtoConversationMember,
  Message as ProtoMessage,
  MessageRequest as ProtoMessageRequest,
} from '@patches/proto';
import {
  ConversationKind,
  ConversationSecurityMode,
  MessageRequestStatus,
} from '@patches/proto/nest';

import { toProtoActor } from '../auth/auth.mapper.js';
import type {
  ConversationMemberView,
  ConversationView,
  MessageRequestView,
  MessageView,
} from './messages.dto.js';

/** Application DTO → protobuf message (spec §128), field-by-field. */

const KIND_TO_PROTO: Readonly<Record<DbConversationKind, ConversationKind>> = Object.freeze({
  DIRECT: ConversationKind.CONVERSATION_KIND_DIRECT,
  GROUP: ConversationKind.CONVERSATION_KIND_GROUP,
});

/**
 * Immutable per conversation (ADR 0020). There is deliberately no inverse map: nothing in the
 * server converts a proto mode back into a persisted one, because nothing may change a
 * conversation's mode after creation.
 */
const SECURITY_MODE_TO_PROTO: Readonly<
  Record<DbConversationSecurityMode, ConversationSecurityMode>
> = Object.freeze({
  LEGACY_SERVER_VISIBLE: ConversationSecurityMode.CONVERSATION_SECURITY_MODE_LEGACY_SERVER_VISIBLE,
  E2EE_V1: ConversationSecurityMode.CONVERSATION_SECURITY_MODE_E2EE_V1,
});

const REQUEST_STATUS_TO_PROTO: Readonly<Record<DbMessageRequestStatus, MessageRequestStatus>> =
  Object.freeze({
    PENDING: MessageRequestStatus.MESSAGE_REQUEST_STATUS_PENDING,
    ACCEPTED: MessageRequestStatus.MESSAGE_REQUEST_STATUS_ACCEPTED,
    DECLINED: MessageRequestStatus.MESSAGE_REQUEST_STATUS_DECLINED,
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

export function toProtoMessage(view: MessageView): ProtoMessage {
  return {
    id: view.id,
    conversationId: view.conversationId,
    sender: view.sender === null ? undefined : toProtoActor(view.sender),
    body: view.body,
    createdAt: dateToTimestamp(view.createdAt),
    deletedAt: view.deletedAt === null ? undefined : dateToTimestamp(view.deletedAt),
  };
}

export function toProtoMessageRequest(view: MessageRequestView): ProtoMessageRequest {
  return {
    id: view.id,
    sender: toProtoActor(view.sender),
    recipient: toProtoActor(view.recipient),
    body: view.body,
    status: REQUEST_STATUS_TO_PROTO[view.status],
    createdAt: dateToTimestamp(view.createdAt),
  };
}
