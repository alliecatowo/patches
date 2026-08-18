import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { GraphController } from './graph.controller.js';
import { GraphService } from './graph.service.js';

/** Social graph — follows, plus block/mute-aware relationship reads (spec §50, §61–63).
 * `AuthModule` is imported for `AuthGuard`. */
@Module({
  imports: [AuthModule],
  controllers: [GraphController],
  providers: [GraphService],
})
export class GraphModule {}
