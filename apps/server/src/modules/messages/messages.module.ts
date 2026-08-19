import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notification.module.js';
import { DmRateLimitService } from './dm-rate-limit.service.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

/** Direct messages are local-only and intentionally import no federation or media module. */
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [MessagesController],
  providers: [MessagesService, DmRateLimitService],
  // ModerationModule uses the exported evidence-snapshot boundary for ReportMessage instead
  // of reaching into the messages tables and duplicating membership rules.
  exports: [MessagesService],
})
export class MessagesModule {}
