import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { GuestbookRateLimitService } from './guestbook-rate-limit.service.js';
import { PagesController } from './pages.controller.js';
import { PageService } from './pages.service.js';

/** Patches Pages (spec §170–172, Phase 4.5). `AuthModule` is imported for `AuthGuard`/
 * `TokenService`, same reuse pattern as every other feature module. */
@Module({
  imports: [AuthModule],
  controllers: [PagesController],
  providers: [PageService, GuestbookRateLimitService],
})
export class PagesModule {}
