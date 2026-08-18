import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notification.module.js';
import { PostModule } from '../posts/post.module.js';
import { ReactionController } from './reaction.controller.js';
import { ReactionsService } from './reaction.service.js';

/**
 * Likes and bookmarks (spec §53). `AuthModule` for `AuthGuard`/`TokenService`; `PostModule`
 * for `PostService` (post existence/block-check/counts, see `reaction.service.ts`'s doc
 * comment); `NotificationsModule` so `LikePost` can notify.
 */
@Module({
  imports: [AuthModule, PostModule, NotificationsModule],
  controllers: [ReactionController],
  providers: [ReactionsService],
})
export class ReactionModule {}
