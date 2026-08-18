import { Injectable, MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { AppConfigService } from '../../config/app-config.service.js';
import { NotificationsModule } from '../notifications/notification.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { MAX_INBOUND_BODY_BYTES } from './federation.constants.js';
import { FederationMetricsService } from './federation-metrics.service.js';
import {
  FEDERATION_GATEWAY,
  NoopFederationGateway,
  type FederationGateway,
} from './federation-gateway.js';
import { ActorController } from './http/actor.controller.js';
import { FederationMetricsController } from './http/federation-metrics.controller.js';
import { InboxController } from './http/inbox.controller.js';
import { OutboxController } from './http/outbox.controller.js';
import { rawBodyCollector } from './http/raw-body.middleware.js';
import { WebfingerController } from './http/webfinger.controller.js';
import { PeerRateLimiterService } from './security/peer-rate-limiter.service.js';
import { ActivityPubFederationGateway } from './services/activitypub-federation-gateway.service.js';
import { ActorDocumentService } from './services/actor-document.service.js';
import { DeliveryService } from './services/delivery.service.js';
import { DomainBlockService } from './services/domain-block.service.js';
import { InboxService } from './services/inbox.service.js';
import { KeyService } from './services/key.service.js';
import { OutboxCollectionService } from './services/outbox-collection.service.js';
import { RemoteActorService } from './services/remote-actor.service.js';
import { WebfingerService } from './services/webfinger.service.js';

/**
 * Dispatches to `ActivityPubFederationGateway` or `NoopFederationGateway` **per call**,
 * re-reading `AppConfigService.federationEnabled` every time, rather than picking one at DI-
 * construction time. This matters beyond tidiness: `@nestjs/config`'s `validate` option runs
 * exactly once per process (the decorator arguments in `config.module.ts` are evaluated once,
 * at that module's first `import`), so a `useFactory` that decided eagerly would freeze
 * whatever `FEDERATION_ENABLED` happened to resolve to at the *first* time this module was
 * ever imported in the process — wrong for anything that legitimately runs multiple `AppModule`
 * instances with different config in one process (the P8-008 two-node integration test).
 * Reading the flag fresh on every call sidesteps that entirely.
 */
@Injectable()
class LazyFederationGateway implements FederationGateway {
  constructor(
    private readonly config: AppConfigService,
    private readonly real: ActivityPubFederationGateway,
  ) {}

  private readonly noop = new NoopFederationGateway();

  private target(): FederationGateway {
    return this.config.federationEnabled ? this.real : this.noop;
  }

  publishPost(manager: EntityManager, postId: string): Promise<void> {
    return this.target().publishPost(manager, postId);
  }
  publishDelete(manager: EntityManager, postId: string): Promise<void> {
    return this.target().publishDelete(manager, postId);
  }
  followRemoteActor(
    manager: EntityManager,
    followerActorId: string,
    targetActorId: string,
  ): Promise<void> {
    return this.target().followRemoteActor(manager, followerActorId, targetActorId);
  }
  unfollowRemoteActor(
    manager: EntityManager,
    followerActorId: string,
    targetActorId: string,
  ): Promise<void> {
    return this.target().unfollowRemoteActor(manager, followerActorId, targetActorId);
  }
  likeRemotePost(manager: EntityManager, actorId: string, postId: string): Promise<void> {
    return this.target().likeRemotePost(manager, actorId, postId);
  }
  unlikeRemotePost(manager: EntityManager, actorId: string, postId: string): Promise<void> {
    return this.target().unlikeRemotePost(manager, actorId, postId);
  }
}

/**
 * The federation HTTP surface + the `FederationGateway` real implementation (P8-001..P8-008).
 * Registered unconditionally in `AppModule` — what actually gates any of this being reachable
 * is `main.ts` only opening the HTTP listener when `FEDERATION_ENABLED=true` (spec §176's
 * "self-hosted node ships with federation disabled by default"). `FEDERATION_GATEWAY` itself
 * is bound to `LazyFederationGateway`, so `GraphService`/`PostService`/`ReactionsService`
 * never need to know which underlying implementation is live.
 */
@Module({
  imports: [NotificationsModule, PagesModule],
  controllers: [
    WebfingerController,
    ActorController,
    OutboxController,
    InboxController,
    FederationMetricsController,
  ],
  providers: [
    KeyService,
    RemoteActorService,
    DeliveryService,
    DomainBlockService,
    InboxService,
    OutboxCollectionService,
    ActorDocumentService,
    WebfingerService,
    PeerRateLimiterService,
    FederationMetricsService,
    ActivityPubFederationGateway,
    { provide: FEDERATION_GATEWAY, useClass: LazyFederationGateway },
  ],
  // `RemoteActorService` is also exported (in addition to `FEDERATION_GATEWAY`) so
  // `ActorModule`'s `ResolveActor` (B-028) can discover-and-upsert a remote actor by
  // `acct:user@domain` without duplicating WebFinger/actor-document fetch logic.
  exports: [FEDERATION_GATEWAY, RemoteActorService],
})
export class FederationModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(rawBodyCollector(MAX_INBOUND_BODY_BYTES)).forRoutes('*');
  }
}
