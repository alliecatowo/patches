import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { RpcExceptionsFilter } from './common/errors/rpc-exception.filter.js';
import { PublicReadGuard } from './common/guards/public-read.guard.js';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor.js';
import { RpcBudgetInterceptor } from './common/interceptors/rpc-budget.interceptor.js';
import { RpcMetricsInterceptor } from './common/interceptors/rpc-metrics.interceptor.js';
import { HttpMetricsInterceptor } from './common/interceptors/http-metrics.interceptor.js';
import { LoggingInterceptor } from './common/logging/logging.interceptor.js';
import { AppConfigModule } from './config/config.module.js';
import { validateEnv } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { ActorModule } from './modules/actors/actor.module.js';
import { AppealModule } from './modules/appeals/appeal.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CommunitiesModule } from './modules/communities/communities.module.js';
import { E2eeModule } from './modules/e2ee/e2ee.module.js';
import { FederationHttpModule } from './modules/federation/federation-http.module.js';
import { FederationModule } from './modules/federation/federation.module.js';
import { FeedModule } from './modules/feeds/feed.module.js';
import { FilterListsModule } from './modules/filter-lists/filter-lists.module.js';
import { FiltersModule } from './modules/filters/filters.module.js';
import { GraphModule } from './modules/graph/graph.module.js';
import { LabelsModule } from './modules/labels/labels.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { MessagesModule } from './modules/messages/messages.module.js';
import { ModerationModule } from './modules/moderation/moderation.module.js';
import { NotificationsModule } from './modules/notifications/notification.module.js';
import { PagesModule } from './modules/pages/pages.module.js';
import { PostModule } from './modules/posts/post.module.js';
import { PrivacyModule } from './modules/privacy/privacy.module.js';
import { ReactionModule } from './modules/reactions/reaction.module.js';
import { SystemModule } from './modules/system/system.module.js';
import { TagsModule } from './modules/tags/tags.module.js';
import { PinoLoggerModule } from './logging/pino-logger.module.js';

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
    CommunitiesModule,
    PostModule,
    ActorModule,
    FeedModule,
    GraphModule,
    NotificationsModule,
    ReactionModule,
    ModerationModule,
    AppealModule,
    MediaModule,
    MessagesModule,
    E2eeModule,
    PagesModule,
    TagsModule,
    FiltersModule,
    FilterListsModule,
    LabelsModule,
    PrivacyModule,
    FederationModule,
    PinoLoggerModule.forRoot(),
    ...(federationHttpEnabled ? [FederationHttpModule] : []),
  ],
  providers: [
    // Keep the budget interceptor addressable as the same singleton that Nest registers
    // globally. The in-process integration harness uses this to reset process-local buckets
    // between examples without changing production admission behavior.
    RpcBudgetInterceptor,
    // Order matters: RequestContextInterceptor establishes the request id (and the
    // rpc/peer pair RpcBudgetInterceptor reads via getRequestContext()) that every
    // interceptor after it depends on — see RpcBudgetInterceptor's own doc comment for why
    // it must stay after this one specifically.
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RpcMetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    // S-001/S-002 (`docs/operations/capacity.md`): per-RPC-class cost budgets, the
    // write-concurrency load-shedding gate, and the server-side call deadline.
    { provide: APP_INTERCEPTOR, useExisting: RpcBudgetInterceptor },
    { provide: APP_FILTER, useClass: RpcExceptionsFilter },
    // PUBLIC_READ=false's global gate (owner decision 2026-08-19) — see
    // common/guards/public-read.guard.ts for the allow-list and reasoning. Depends on
    // AuthModule's exported AuthGuard, which AppModule already imports below.
    { provide: APP_GUARD, useClass: PublicReadGuard },
  ],
})
export class AppModule {}
