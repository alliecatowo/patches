import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { GuestbookRateLimitService } from './guestbook-rate-limit.service.js';
import { PagesController } from './pages.controller.js';
import { PageService } from './pages.service.js';

/** Patches Pages (spec §170–172, Phase 4.5). `AuthModule` is imported for `AuthGuard`/
 * `TokenService`, same reuse pattern as every other feature module. */
// nestjs-doctor-ignore-next-line performance/no-unused-module-exports -- FederationHttpModule's ActorController injects PageService; that module is conditionally imported (ADR 0016 §4), so the scanner drops the edge
@Module({
  imports: [AuthModule],
  controllers: [PagesController],
  providers: [PageService, GuestbookRateLimitService],
  exports: [PageService],
})
export class PagesModule {}
