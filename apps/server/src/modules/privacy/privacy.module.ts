import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { storageClientProvider } from '../media/storage-client.provider.js';
import { PrivacyController } from './privacy.controller.js';
import { PrivacyService } from './privacy.service.js';

/**
 * Privacy and consent surfaces (spec §197): the privacy notice, per-actor discoverability
 * preferences, account data export, and account deletion with a grace period.
 *
 * `storageClientProvider` is re-registered here (not imported from `MediaModule`, which does
 * not export its `STORAGE_CLIENT` token) — the same lazily-built `LazyStorageClient` factory,
 * scoped to this module the same way `MediaModule` scopes its own copy. `AuthModule` supplies
 * `AuthGuard`, `RateLimitService`, and `TokenService`.
 *
 * `locked` (spec §197.5) is accepted and stored by `UpdatePrivacyPrefs` here, but has **no
 * follow-request enforcement yet** — that requires `modules/graph` (`FollowActor` gaining a
 * pending/approve flow), which is out of this module's scope. Until it ships, every client
 * must keep describing `FOLLOWERS`-visibility posts as "not shown publicly", never "private"
 * (spec §197.5, `docs/architecture/api.md` §3a).
 */
@Module({
  imports: [AuthModule],
  controllers: [PrivacyController],
  providers: [PrivacyService, storageClientProvider],
})
export class PrivacyModule {}
