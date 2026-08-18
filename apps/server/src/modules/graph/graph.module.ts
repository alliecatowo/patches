import { Module } from '@nestjs/common';

import { ActorModule } from '../actors/actor.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { FederationModule } from '../federation/federation.module.js';
import { NotificationsModule } from '../notifications/notification.module.js';
import { GraphController } from './graph.controller.js';
import { GraphService } from './graph.service.js';

/** Social graph — follows, plus block/mute-aware relationship reads (spec §50, §61–63).
 * `AuthModule` is imported for `AuthGuard`; `FederationModule` so following/unfollowing a
 * remote actor delivers `Follow`/`Undo(Follow)` through the `FederationGateway` seam
 * (P8-002/P8-003); `ActorModule` so `ListMutualFollows` (B-024) can reuse `ActorService`'s
 * existing actor-list-with-counts query/mapping machinery rather than duplicating it here. */
@Module({
  imports: [AuthModule, NotificationsModule, FederationModule, ActorModule],
  controllers: [GraphController],
  providers: [GraphService],
})
export class GraphModule {}
