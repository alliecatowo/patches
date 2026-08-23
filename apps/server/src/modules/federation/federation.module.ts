import { Injectable, Module } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { AppConfigService } from '../../config/app-config.service.js';
import { NotificationsModule } from '../notifications/notification.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { FederationMetricsService } from './federation-metrics.service.js';
import {
  FEDERATION_GATEWAY,
  NoopFederationGateway,
  type FederationGateway,
} from './federation-gateway.js';
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
  announceRemotePost(manager: EntityManager, repostId: string): Promise<void> {
    return this.target().announceRemotePost(manager, repostId);
  }
  unannounceRemotePost(manager: EntityManager, repostId: string): Promise<void> {
    return this.target().unannounceRemotePost(manager, repostId);
  }
}

/**
 * The `FederationGateway` real implementation and every service the federation HTTP surface
 * needs (P8-001..P8-008) — no controllers. Registered unconditionally in `AppModule`
 * (imported directly by `PostModule`/`ActorModule`/`GraphModule`/`ReactionModule` too, for
 * `FEDERATION_GATEWAY`/`RemoteActorService`) because `publishPost`/`followRemoteActor`/etc.
 * must resolve to *something* — `LazyFederationGateway` — on every node regardless of
 * `FEDERATION_ENABLED`; it's the target it dispatches to (`NoopFederationGateway` vs the real
 * one) that's conditional, decided per-call, not at DI-construction time (see the class doc
 * comment above). The HTTP surface itself (webfinger/actor/inbox/outbox) is a separate
 * module, `FederationHttpModule`, so it can be the thing that's actually absent — not merely
 * unrouted — when federation is off (ADR 0016 §4; ADR 0016 also changed *how* that HTTP
 * surface reaches the network — see `main.ts`).
 */
@Module({
  imports: [NotificationsModule, PagesModule],
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
  // `RemoteActorService` is exported (in addition to `FEDERATION_GATEWAY`) so
  // `ActorModule`'s `ResolveActor` (B-028) can discover-and-upsert a remote actor by
  // `acct:user@domain` without duplicating WebFinger/actor-document fetch logic. The rest
  // (`ActorDocumentService`, `WebfingerService`, `InboxService`, `PeerRateLimiterService`,
  // `FederationMetricsService`, `OutboxCollectionService`) are exported solely so
  // `FederationHttpModule`'s controllers — which live in a different module and only import
  // this one — can inject them; nothing else in the app needs them.
  exports: [
    FEDERATION_GATEWAY,
    RemoteActorService,
    ActorDocumentService,
    WebfingerService,
    InboxService,
    PeerRateLimiterService,
    FederationMetricsService,
    OutboxCollectionService,
  ],
})
export class FederationModule {}
