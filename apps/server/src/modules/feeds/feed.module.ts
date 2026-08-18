import { Module } from '@nestjs/common';

import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';

/** Chronological, fan-out-on-read feeds (spec §52, §59). No `AuthModule` import: every RPC
 * here is anonymous-readable, unlike `PostModule`/`ActorModule`'s write paths. */
@Module({
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
