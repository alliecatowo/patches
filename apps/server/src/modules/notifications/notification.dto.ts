import type { NotificationType } from '@patches/database';

import type { ActorSummary } from '../auth/auth.dto.js';

/**
 * `NotificationsService`'s own vocabulary (spec §128–129) — a `Notification` entity never
 * reaches `NotificationController`. Reuses `auth.dto.ts`'s `ActorSummary`, same reasoning as
 * `PostView.author` in `posts/post.dto.ts`.
 */
export interface NotificationView {
  id: string;
  type: NotificationType;
  /** `null` for a MODERATION notification with no attributable actor. */
  actor: ActorSummary | null;
  /** `null` for FOLLOW/MODERATION. */
  postId: string | null;
  createdAt: Date;
  readAt: Date | null;
}
