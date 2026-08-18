import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { RpcExceptionsFilter } from './common/errors/rpc-exception.filter.js';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor.js';
import { LoggingInterceptor } from './common/logging/logging.interceptor.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ActorModule } from './modules/actors/actor.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FeedModule } from './modules/feeds/feed.module.js';
import { GraphModule } from './modules/graph/graph.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { ModerationModule } from './modules/moderation/moderation.module.js';
import { NotificationsModule } from './modules/notifications/notification.module.js';
import { PagesModule } from './modules/pages/pages.module.js';
import { PostModule } from './modules/posts/post.module.js';
import { ReactionModule } from './modules/reactions/reaction.module.js';
import { SystemModule } from './modules/system/system.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    SystemModule,
    AuthModule,
    PostModule,
    ActorModule,
    FeedModule,
    GraphModule,
    NotificationsModule,
    ReactionModule,
    ModerationModule,
    MediaModule,
    PagesModule,
  ],
  providers: [
    // Order matters: RequestContextInterceptor establishes the request id that
    // LoggingInterceptor and RpcExceptionsFilter both read.
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: RpcExceptionsFilter },
  ],
})
export class AppModule {}
