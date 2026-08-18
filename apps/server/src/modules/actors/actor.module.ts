import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { FederationModule } from '../federation/federation.module.js';
import { ActorController } from './actor.controller.js';
import { ActorService } from './actor.service.js';
import { ActorResolveRateLimitService } from './actor-resolve-rate-limit.service.js';

/** Actor profiles (spec §19, §21, §49). `AuthModule` is imported for `AuthGuard`;
 * `FederationModule` (for `RemoteActorService`) so `ResolveActor` (B-028) can discover a
 * remote actor by `acct:user@domain`. */
@Module({
  imports: [AuthModule, FederationModule],
  controllers: [ActorController],
  providers: [ActorService, ActorResolveRateLimitService],
  exports: [ActorService],
})
export class ActorModule {}
