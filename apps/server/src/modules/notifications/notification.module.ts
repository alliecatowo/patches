import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { NotificationController } from './notification.controller.js';
import { NotificationsService } from './notification.service.js';

/**
 * Notification rows (spec §56, §113). `AuthModule` is imported for `AuthGuard`.
 * `NotificationsService` is exported: `PostService` (replies/mentions) and `ReactionsService`
 * (likes) call its `notify*` methods as a side effect of their own writes — see the service's
 * doc comment.
 */
@Module({
  imports: [AuthModule],
  controllers: [NotificationController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
