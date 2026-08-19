import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { AppealController } from './appeal.controller.js';
import { AppealService } from './appeal.service.js';

/**
 * Appeals against a node moderation notice (spec §201.3). `AuthModule` for `DbRateLimitStore`
 * (the database-backed, per-actor rate limit spec §102/§204 asks for); `ModerationModule` for
 * `SuspensionTolerantAuthGuard` — every RPC here must stay reachable by a suspended account
 * appealing that very suspension (see that guard's doc comment). One Nest module per bounded
 * area, per spec §203 — a sibling of `ModerationModule`, not a sub-module of it, even though
 * `AppealService` also reads `ModerationModule`'s `notice-projection` helper (a plain function
 * file, not a provider, so no DI wiring is needed for that reuse).
 */
@Module({
  imports: [AuthModule, ModerationModule],
  controllers: [AppealController],
  providers: [AppealService],
})
export class AppealModule {}
