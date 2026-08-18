import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';

/** Chronological, fan-out-on-read feeds (spec §52, §59). `AuthModule` is imported for
 * `AuthGuard` (`ListHomeFeed`) and `TokenService` (optional-viewer lookup on the
 * anonymous-readable `ListLocalFeed`/`ListActorPosts` — see `FeedController`). */
@Module({
  imports: [AuthModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
