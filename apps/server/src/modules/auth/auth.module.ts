import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { DbRateLimitStore } from './db-rate-limit-store.service.js';
import { DeviceLinkAttemptsService } from './device-link-attempts.service.js';
import { GitHubDeviceFlowService } from './github-device-flow.service.js';
import { GitHubLoginAttemptsService } from './github-login-attempts.service.js';
import { OidcDeviceFlowService } from './oidc-device-flow.service.js';
import { OidcLoginAttemptsService } from './oidc-login-attempts.service.js';
import { PasskeyChallengeService } from './passkey-challenge.service.js';
import { PasskeyVerifierService } from './passkey-verifier.service.js';
import { PasswordHasher } from './password-hasher.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { SshChallengeService } from './ssh-challenge.service.js';
import { TokenService } from './token.service.js';

/**
 * Authentication and credential management (spec §33–§39, §165–§168).
 *
 * `TokenService` and `AuthGuard` are exported because every other feature module will need to
 * authenticate a call; `RateLimitService` is exported too — it's a single process-local
 * limiter shared by every sensitive flow (spec §102), not an auth-only concern (`MediaModule`
 * throttles `BeginMediaUpload` through the same instance rather than a second one with its
 * own, disjoint bucket map). `DbRateLimitStore` is exported too (P11-006): it is a generic
 * `(key, windowMs)` database-backed counter, not auth-specific — `posts`/`reactions` call it
 * directly (via `common/rate-limit/window-rate-limiter.ts`) for repost/quote/edit throttling
 * rather than joining auth's own closed `RateLimitAction` union.
 */
// nestjs-doctor-ignore-next-line performance/no-unused-module-exports -- AuthGuard is consumed two ways the scanner can't see: @UseGuards(AuthGuard) class references in feature-module controllers, and PublicReadGuard (APP_GUARD, app.module.ts) which constructor-injects it via AppModule's AuthModule import
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    PasswordHasher,
    RateLimitService,
    DbRateLimitStore,
    SshChallengeService,
    TokenService,
    GitHubDeviceFlowService,
    GitHubLoginAttemptsService,
    OidcDeviceFlowService,
    OidcLoginAttemptsService,
    DeviceLinkAttemptsService,
    PasskeyChallengeService,
    PasskeyVerifierService,
  ],
  exports: [AuthGuard, TokenService, RateLimitService, DbRateLimitStore],
})
export class AuthModule {}
