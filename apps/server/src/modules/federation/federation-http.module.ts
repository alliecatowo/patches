import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';

import { PagesModule } from '../pages/pages.module.js';
import { FederationModule } from './federation.module.js';
import { MAX_INBOUND_BODY_BYTES } from './federation.constants.js';
import { ActorController } from './http/actor.controller.js';
import { FederationMetricsController } from './http/federation-metrics.controller.js';
import { InboxController } from './http/inbox.controller.js';
import { OutboxController } from './http/outbox.controller.js';
import { rawBodyCollector } from './http/raw-body.middleware.js';
import { WebfingerController } from './http/webfinger.controller.js';

/**
 * The federation HTTP surface (webfinger/actor/inbox/outbox, P8-001..P8-008) — split out of
 * `FederationModule` (which stays the always-registered gateway/services module every other
 * feature module imports) specifically so this module, and only this module, can be absent
 * from the DI graph on a node with `FEDERATION_ENABLED=false` (`app.module.ts`). "Absent, not
 * merely unrouted" (ADR 0016 §4) has to mean *this* module never being imported at all: Nest
 * has no way to conditionally register a subset of one module's own controllers/routes, and
 * `FederationModule` itself is imported unconditionally by `PostModule`/`ActorModule`/
 * `GraphModule`/`ReactionModule` for `FEDERATION_GATEWAY` — removing it from `AppModule`'s own
 * `imports` would do nothing (those other modules still pull it in transitively). This module
 * has no such transitive importer, so it's the one Nest module in this subtree that
 * `app.module.ts` can genuinely leave out.
 *
 * `rawBodyCollector` is scoped to `InboxController` specifically (not `forRoutes('*')` as
 * this used to be, back when the federation HTTP surface was the *only* thing this app's
 * HTTP adapter ever served) — ADR 0016 mounts the Connect edge on the same Express instance,
 * and a body-consuming middleware on every route would read the request stream out from under
 * `expressConnectMiddleware` before it gets a chance to.
 */
@Module({
  imports: [FederationModule, PagesModule],
  controllers: [
    WebfingerController,
    ActorController,
    OutboxController,
    InboxController,
    FederationMetricsController,
  ],
})
export class FederationHttpModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(rawBodyCollector(MAX_INBOUND_BODY_BYTES)).forRoutes(InboxController);
  }
}
