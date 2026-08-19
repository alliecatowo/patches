import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { RpcExceptionsFilter } from './common/errors/rpc-exception.filter.js';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor.js';
import { LoggingInterceptor } from './common/logging/logging.interceptor.js';
import { AppConfigModule } from './config/config.module.js';
import { validateEnv } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { ActorModule } from './modules/actors/actor.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FederationHttpModule } from './modules/federation/federation-http.module.js';
import { FederationModule } from './modules/federation/federation.module.js';
import { FeedModule } from './modules/feeds/feed.module.js';
import { GraphModule } from './modules/graph/graph.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { ModerationModule } from './modules/moderation/moderation.module.js';
import { NotificationsModule } from './modules/notifications/notification.module.js';
import { PagesModule } from './modules/pages/pages.module.js';
import { PostModule } from './modules/posts/post.module.js';
import { ReactionModule } from './modules/reactions/reaction.module.js';
import { SystemModule } from './modules/system/system.module.js';

/**
 * Decides whether `FederationHttpModule` (webfinger/actor/inbox/outbox) is part of this
 * process's module graph at all — evaluated once, here, at `app.module.ts`'s own
 * module-evaluation time, exactly like `ConfigModule.forRoot({ validate })` in
 * `config.module.ts` already does (see that file's comment, and
 * `docs/agents/LEARNINGS.md`'s `@nestjs/config forRoot frozen once per process` entry). That
 * timing is safe here for the same reason it's safe there: this app only ever boots one
 * `AppModule` per process — every place that needs two live nodes with different
 * `FEDERATION_ENABLED` values in one test run (`test/support/federation-node.ts`, P8-008)
 * spawns each node as a **separate OS process** running the built `dist/main.js`,
 * specifically so this per-process freeze is never observed. A `DynamicModule`/`forRoot()`
 * pattern was the other option (ADR 0016 §4's task brief suggests either); it isn't used
 * because Nest would then need `PostModule`/`ActorModule`/`GraphModule`/`ReactionModule` (each
 * of which imports the *separate* `FederationModule` unconditionally, for
 * `FEDERATION_GATEWAY`) to agree on the exact same dynamic-module options object to dedupe
 * correctly — reading the flag once here, for the one module that's actually conditional,
 * avoids that coordination problem entirely.
 */
const federationHttpEnabled = validateEnv(process.env).FEDERATION_ENABLED;

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
    FederationModule,
    ...(federationHttpEnabled ? [FederationHttpModule] : []),
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
