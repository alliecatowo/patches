import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { FederationModule } from '../federation/federation.module.js';
import { NotificationsModule } from '../notifications/notification.module.js';
import { GraphController } from './graph.controller.js';
import { GraphService } from './graph.service.js';

/** Social graph — follows, plus block/mute-aware relationship reads (spec §50, §61–63).
 * `AuthModule` is imported for `AuthGuard`; `FederationModule` so following/unfollowing a
 * remote actor delivers `Follow`/`Undo(Follow)` through the `FederationGateway` seam
 * (P8-002/P8-003). */
@Module({
  imports: [AuthModule, NotificationsModule, FederationModule],
  controllers: [GraphController],
  providers: [GraphService],
})
export class GraphModule {}
