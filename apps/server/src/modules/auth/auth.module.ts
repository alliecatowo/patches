import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { SshChallengeService } from './ssh-challenge.service.js';
import { TokenService } from './token.service.js';

/**
 * Authentication and credential management (spec §33–§39, §165–§168).
 *
 * `TokenService` and `AuthGuard` are exported because every other feature module will need to
 * authenticate a call; nothing else here is anyone else's business.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    PasswordHasher,
    RateLimitService,
    SshChallengeService,
    TokenService,
  ],
  exports: [AuthGuard, TokenService],
})
export class AuthModule {}
