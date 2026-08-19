import type { NotificationType as DbNotificationType } from '@patches/database';
import { dateToTimestamp } from '@patches/proto';
import type { Notification as ProtoNotification } from '@patches/proto';
import { NotificationType } from '@patches/proto/nest';

import { toProtoActor } from '../auth/auth.mapper.js';
import type { NotificationView } from './notification.dto.js';

/** Application DTO → protobuf message (spec §128), field-by-field. */

const NOTIFICATION_TYPE_TO_PROTO: Readonly<Record<DbNotificationType, NotificationType>> =
  Object.freeze({
    FOLLOW: NotificationType.NOTIFICATION_TYPE_FOLLOW,
    LIKE: NotificationType.NOTIFICATION_TYPE_LIKE,
    REPLY: NotificationType.NOTIFICATION_TYPE_REPLY,
    MENTION: NotificationType.NOTIFICATION_TYPE_MENTION,
    MODERATION: NotificationType.NOTIFICATION_TYPE_MODERATION,
    REPOST: NotificationType.NOTIFICATION_TYPE_REPOST,
    QUOTE: NotificationType.NOTIFICATION_TYPE_QUOTE,
    MESSAGE: NotificationType.NOTIFICATION_TYPE_MESSAGE,
    COMMUNITY_INVITE: NotificationType.NOTIFICATION_TYPE_COMMUNITY_INVITE,
    FOLLOW_REQUEST: NotificationType.NOTIFICATION_TYPE_FOLLOW_REQUEST,
  });

export function toProtoNotification(view: NotificationView): ProtoNotification {
  return {
    id: view.id,
    type: NOTIFICATION_TYPE_TO_PROTO[view.type],
    actor: view.actor === null ? undefined : toProtoActor(view.actor),
    postId: view.postId ?? '',
    createdAt: dateToTimestamp(view.createdAt),
    readAt: view.readAt === null ? undefined : dateToTimestamp(view.readAt),
    conversationId: view.conversationId ?? '',
    communityId: view.communityId ?? '',
  };
}
