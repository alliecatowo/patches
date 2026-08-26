import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PostModule } from '../posts/post.module.js';
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { ReportRateLimitService } from './report-rate-limit.service.js';
import { SuspensionTolerantAuthGuard } from './suspension-tolerant-auth.guard.js';

/**
 * Block/mute/report (spec §55, §61–64, Phase 6 spec §140). `AuthModule` for `AuthGuard`/
 * `TokenService` (the latter also backs `SuspensionTolerantAuthGuard`, P14-011); `PostModule`
 * for `PostService` (`ReportPost`'s existence/block check, same reuse pattern as
 * `ReactionModule`). No longer imports `MessagesModule` — `ReportMessage`'s snapshot-evidence
 * boundary was removed by ADR 0030 §B-095 along with the plaintext DM machinery it snapshotted.
 */
// nestjs-doctor-ignore-next-line performance/no-unused-module-exports -- appeals module binds this guard via @UseGuards(SuspensionTolerantAuthGuard), a class-token reference the static module graph cannot see
@Module({
  imports: [AuthModule, PostModule],
  controllers: [ModerationController],
  providers: [ModerationService, ReportRateLimitService, SuspensionTolerantAuthGuard],
  exports: [SuspensionTolerantAuthGuard],
})
export class ModerationModule {}
