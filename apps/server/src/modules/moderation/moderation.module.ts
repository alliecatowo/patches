import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { PostModule } from '../posts/post.module.js';
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { ReportRateLimitService } from './report-rate-limit.service.js';

/**
 * Block/mute/report (spec §55, §61–64, Phase 6 spec §140). `AuthModule` for `AuthGuard`;
 * `PostModule` for `PostService` (`ReportPost`'s existence/block check, same reuse pattern as
 * `ReactionModule`).
 */
@Module({
  imports: [AuthModule, PostModule, MessagesModule],
  controllers: [ModerationController],
  providers: [ModerationService, ReportRateLimitService],
})
export class ModerationModule {}
