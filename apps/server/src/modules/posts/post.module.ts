import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { FederationModule } from '../federation/federation.module.js';
import { NotificationsModule } from '../notifications/notification.module.js';
import { PostController } from './post.controller.js';
import { PostService } from './post.service.js';

/**
 * Posts and replies (spec §23–26, §45, §51). `AuthModule` is imported for `AuthGuard`;
 * `NotificationsModule` so `PostService` can notify on REPLY/MENTION; `FederationModule` so a
 * new/deleted public post delivers `Create`/`Delete` to remote followers through the
 * `FederationGateway` seam (P8-002/P8-003). `PostService` is exported: `ReactionsModule`
 * reuses it for post existence/block-check/counts (`getPost`) instead of duplicating that
 * logic for `LikePost`/`BookmarkPost`.
 */
@Module({
  imports: [AuthModule, NotificationsModule, FederationModule],
  controllers: [PostController],
  providers: [PostService],
  exports: [PostService],
})
export class PostModule {}
